import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Redis from "ioredis";
import { createHmac } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { eq, and } from "drizzle-orm";
import { IngestPayloadSchema } from "@agentgraph/types";
import { computeCost } from "../lib/modelCosts.js";
import { traces, traceSteps, tools, webhooks } from "../db/schema.js";

const QUEUE_KEY = "agentgraph:ingest:queue";

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
    let parsed: ReturnType<typeof IngestPayloadSchema.safeParse>;

    try {
      parsed = IngestPayloadSchema.safeParse(JSON.parse(raw));
    } catch {
      console.error("[ingest-consumer] JSON parse error");
      continue;
    }

    if (!parsed.success) {
      console.error("[ingest-consumer] schema validation failed:", parsed.error.message);
      continue;
    }

    // The ingest route attaches projectId before queuing
    const payload = parsed.data as typeof parsed.data & {
      projectId: string;
      traceId: string;
    };

    const traceId = payload.traceId ?? uuidv4();
    let committedCostUsd: number | null = null;

    try {
      await db.transaction(async (tx) => {
        // ── 1. Compute costs for each step ────────────────────────────────
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

        // ── 2. Upsert trace ────────────────────────────────────────────────
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

        // ── 3. Insert trace steps ─────────────────────────────────────────
        if (enrichedSteps.length > 0) {
          await tx.insert(traceSteps).values(enrichedSteps);
        }

        // ── 4. Auto-discover tools — upsert unknown tool slugs ────────────
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
      // ── 5. Fire cost-spike webhooks if threshold exceeded ────────────
      if (committedCostUsd !== null && committedCostUsd >= COST_SPIKE_THRESHOLD_USD) {
        fireCostSpikeWebhooks(db, payload.projectId, {
          traceId,
          agentId: payload.agentId,
          costUsd: committedCostUsd,
        }).catch((e) => console.error("[ingest-consumer] webhook fire failed:", e));
      }
    } catch (err) {
      console.error("[ingest-consumer] db transaction failed:", err);
    }
  }
}

const COST_SPIKE_THRESHOLD_USD = parseFloat(
  process.env["COST_SPIKE_THRESHOLD_USD"] ?? "1.00",
);

async function fireCostSpikeWebhooks(
  db: PostgresJsDatabase,
  projectId: string,
  context: { traceId: string; agentId: string; costUsd: number },
): Promise<void> {
  const targets = await db
    .select({ url: webhooks.url, secret: webhooks.secret, events: webhooks.events })
    .from(webhooks)
    .where(
      and(
        eq(webhooks.projectId, projectId),
        eq(webhooks.enabled, true),
      ),
    );

  if (targets.length === 0) return;

  const body = JSON.stringify({
    event: "cost_spike",
    projectId,
    traceId: context.traceId,
    agentId: context.agentId,
    costUsd: context.costUsd,
    threshold: COST_SPIKE_THRESHOLD_USD,
    timestamp: new Date().toISOString(),
  });

  await Promise.allSettled(
    targets
      .filter((t) => t.events?.includes("cost_spike"))
      .map(async (target) => {
        const sig = createHmac("sha256", target.secret)
          .update(body)
          .digest("hex");
        await fetch(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-AgentGraph-Signature": `sha256=${sig}`,
          },
          body,
          signal: AbortSignal.timeout(5000),
        });
      }),
  );
}

function toTitleCase(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
