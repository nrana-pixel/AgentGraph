import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { Redis } from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";
import { IngestPayloadSchema } from "@agentgraph/types";
import type { Drizzle } from "../types.js";
import { computeCost } from "../lib/modelCosts.js";
import { deliverSignedWebhooks } from "../lib/signedWebhookDelivery.js";
import { traces, traceSteps, tools, projects } from "../db/schema.js";

const QUEUE_KEY = "agentgraph:ingest:queue";
const DEAD_LETTER_KEY = "agentgraph:ingest:dead";
const DEAD_LETTER_MAX = 10_000;

// Park a payload we can't process instead of dropping it silently. Records
// stay replayable and the list depth is alertable; trimmed so a flood of bad
// input can't grow Redis without bound.
async function deadLetter(redis: Redis, raw: string, reason: string): Promise<void> {
  try {
    await redis.lpush(
      DEAD_LETTER_KEY,
      JSON.stringify({ reason, payload: raw, failedAt: new Date().toISOString() }),
    );
    await redis.ltrim(DEAD_LETTER_KEY, 0, DEAD_LETTER_MAX - 1);
  } catch (err) {
    console.error("[ingest-consumer] failed to write dead-letter record:", err);
  }
}

export async function startIngestConsumer(
  redisUrl: string,
  databaseUrl: string,
): Promise<void> {
  const pgClient = postgres(databaseUrl);
  const db = drizzle(pgClient);
  const redis = new Redis(redisUrl);

  console.log("[ingest-consumer] started, polling queue:", QUEUE_KEY);

  while (true) {
    const result = await redis.brpop(QUEUE_KEY, 1);
    if (!result) continue;

    const [, raw] = result;
    let rawJson: unknown;
    try {
      rawJson = JSON.parse(raw);
    } catch {
      console.error("[ingest-consumer] JSON parse error");
      await deadLetter(redis, raw, "json_parse_error");
      continue;
    }

    // The ingest route attaches projectId before queuing. Pull it out of the
    // raw payload BEFORE schema validation, because IngestPayloadSchema does
    // not declare projectId (the SDK never sends one) and Zod will strip it.
    const projectId =
      typeof rawJson === "object" && rawJson !== null && typeof (rawJson as { projectId?: unknown }).projectId === "string"
        ? (rawJson as { projectId: string }).projectId
        : null;
    if (!projectId) {
      console.error("[ingest-consumer] queued payload missing projectId; dropping");
      await deadLetter(redis, raw, "missing_project_id");
      continue;
    }

    const parsed = IngestPayloadSchema.safeParse(rawJson);
    if (!parsed.success) {
      console.error("[ingest-consumer] schema validation failed:", parsed.error.message);
      await deadLetter(redis, raw, `schema_validation_failed: ${parsed.error.message}`);
      continue;
    }

    const payload = { ...parsed.data, projectId };

    const traceId = payload.traceId ?? uuidv4();
    let committedCostUsd: number | null = null;

    try {
      await db.transaction(async (tx) => {
        // ── 1. Compute costs for each step ────────────────────────────────────
        let totalComputedCostUsd = 0;
        let totalComputedTokens = 0;

        const enrichedSteps = payload.steps.map((step, idx) => {
          const promptTokens = step.tokenUsage?.prompt ?? 0;
          const completionTokens = step.tokenUsage?.completion ?? 0;
          const totalTokens = step.tokenUsage?.total ?? promptTokens + completionTokens;

          // Use SDK-provided cost if present, otherwise compute from model pricing
          let costUsd = step.costUsd ?? null;
          if (
            costUsd === null &&
            step.model &&
            step.type === "llm_call" &&
            totalTokens > 0
          ) {
            costUsd = computeCost(step.model, promptTokens, completionTokens);
          }

          totalComputedCostUsd += costUsd ?? 0;
          totalComputedTokens += totalTokens;

          return {
            id: step.stepId ?? uuidv4(),
            traceId,
            stepIndex: idx,
            type: step.type,
            name: step.name,
            input: step.input ? JSON.stringify(step.input) : null,
            output: step.output ? JSON.stringify(step.output) : null,
            latencyMs: step.latencyMs ?? null,
            promptTokens: promptTokens || null,
            completionTokens: completionTokens || null,
            totalTokens: totalTokens || null,
            costUsd: costUsd?.toFixed(8) ?? null,
            error: step.error ?? null,
            model: step.model ?? null,
            toolName: step.toolName ?? null,
            toolVersion: step.toolVersion ?? null,
            timestamp: step.timestamp ? new Date(step.timestamp) : new Date(),
          };
        });

        const finalCostUsd =
          payload.totalCostUsd ?? (totalComputedCostUsd > 0 ? totalComputedCostUsd : null);
        committedCostUsd = finalCostUsd;
        const finalTokens =
          payload.totalTokens ?? (totalComputedTokens > 0 ? totalComputedTokens : null);

        // ── 2. Upsert trace ───────────────────────────────────────────────────────
        await tx.insert(traces).values({
          id: traceId,
          projectId: payload.projectId,
          agentId: payload.agentId,
          sessionId: payload.sessionId ?? null,
          userId: payload.userId ?? null,
          env: payload.env,
          status: payload.status,
          totalLatencyMs: payload.totalLatencyMs ?? null,
          totalTokens: finalTokens,
          totalCostUsd: finalCostUsd?.toFixed(8) ?? null,
          metadata: JSON.stringify(payload.metadata ?? {}),
          endedAt: payload.status !== "running" ? new Date() : null,
        });

        // ── 3. Insert trace steps ─────────────────────────────────────────────────
        if (enrichedSteps.length > 0) {
          await tx.insert(traceSteps).values(enrichedSteps);
        }

        // ── 4. Auto-discover tools — upsert unknown tool slugs ────────────────────────
        const toolNames = [
          ...new Set(
            payload.steps
              .filter((s) => s.type === "tool_call" && s.toolName)
              .map((s) => s.toolName!.toLowerCase().trim()),
          ),
        ];

        for (const toolSlug of toolNames) {
          await tx
            .insert(tools)
            .values({
              slug: toolSlug,
              name: toTitleCase(toolSlug),
              category: "other",
              dataSource: "telemetry",
            })
            .onConflictDoNothing();
        }
      });
      // ── 5. Fire cost-spike webhooks if the project's threshold is exceeded ─
      if (committedCostUsd !== null) {
        const [project] = await db
          .select({ threshold: projects.costSpikeThresholdUsd })
          .from(projects)
          .where(eq(projects.id, payload.projectId));

        const parsedThreshold =
          project?.threshold != null ? Number(project.threshold) : NaN;
        const threshold = Number.isFinite(parsedThreshold)
          ? parsedThreshold
          : COST_SPIKE_THRESHOLD_USD;

        if (committedCostUsd >= threshold) {
          fireCostSpikeWebhooks(db, payload.projectId, {
            traceId,
            agentId: payload.agentId,
            costUsd: committedCostUsd,
            threshold,
          }).catch((e) => console.error("[ingest-consumer] webhook fire failed:", e));
        }
      }
    } catch (err) {
      console.error("[ingest-consumer] db transaction failed:", err);
      await deadLetter(redis, raw, `db_transaction_failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// Fallback used when a project has no configured cost-spike threshold.
const COST_SPIKE_THRESHOLD_USD = 1.00;

async function fireCostSpikeWebhooks(
  db: Drizzle,
  projectId: string,
  context: { traceId: string; agentId: string; costUsd: number; threshold: number },
): Promise<void> {
  await deliverSignedWebhooks(db, projectId, "cost_spike", {
    event: "cost_spike",
    projectId,
    traceId: context.traceId,
    agentId: context.agentId,
    costUsd: context.costUsd,
    threshold: context.threshold,
    timestamp: new Date().toISOString(),
  });
}

function toTitleCase(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
