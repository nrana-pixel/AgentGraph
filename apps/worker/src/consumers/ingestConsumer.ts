import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { IngestPayloadSchema } from "@agentgraph/types";

const QUEUE_KEY = "agentgraph:ingest:queue";
const BATCH_TIMEOUT_MS = 100;

export async function startIngestConsumer(
  redisUrl: string,
  databaseUrl: string,
): Promise<void> {
  const client = postgres(databaseUrl);
  const db = drizzle(client);
  const redis = new Redis(redisUrl);

  // Import schema lazily to avoid circular deps
  const { traces, traceSteps } = await import("../../db/schema.js");

  console.log("[ingest-consumer] started, polling queue:", QUEUE_KEY);

  while (true) {
    // BRPOP blocks for up to 1s, returning null on timeout
    const result = await redis.brpop(QUEUE_KEY, 1);
    if (!result) continue;

    const [, raw] = result;
    let parsed: ReturnType<typeof IngestPayloadSchema.safeParse>;

    try {
      parsed = IngestPayloadSchema.safeParse(JSON.parse(raw));
    } catch {
      console.error("[ingest-consumer] failed to parse payload");
      continue;
    }

    if (!parsed.success) {
      console.error("[ingest-consumer] invalid payload:", parsed.error.message);
      continue;
    }

    const payload = parsed.data as typeof parsed.data & { projectId: string; traceId: string };
    const traceId = payload.traceId ?? uuidv4();

    try {
      await db.transaction(async (tx) => {
        await tx.insert(traces).values({
          id: traceId,
          projectId: payload.projectId,
          agentId: payload.agentId,
          sessionId: payload.sessionId ?? null,
          userId: payload.userId ?? null,
          env: payload.env,
          status: payload.status,
          totalLatencyMs: payload.totalLatencyMs ?? null,
          totalTokens: payload.totalTokens ?? null,
          totalCostUsd: payload.totalCostUsd?.toString() ?? null,
          metadata: JSON.stringify(payload.metadata ?? {}),
          endedAt: payload.status !== "running" ? new Date() : null,
        });

        const stepRows = payload.steps.map((step, idx) => ({
          id: step.stepId ?? uuidv4(),
          traceId,
          stepIndex: idx,
          type: step.type,
          name: step.name,
          input: step.input ? JSON.stringify(step.input) : null,
          output: step.output ? JSON.stringify(step.output) : null,
          latencyMs: step.latencyMs ?? null,
          promptTokens: step.tokenUsage?.prompt ?? null,
          completionTokens: step.tokenUsage?.completion ?? null,
          totalTokens: step.tokenUsage?.total ?? null,
          costUsd: step.costUsd?.toString() ?? null,
          error: step.error ?? null,
          model: step.model ?? null,
          toolName: step.toolName ?? null,
          toolVersion: step.toolVersion ?? null,
          timestamp: step.timestamp ? new Date(step.timestamp) : new Date(),
        }));

        if (stepRows.length > 0) {
          await tx.insert(traceSteps).values(stepRows);
        }
      });
    } catch (err) {
      console.error("[ingest-consumer] db write failed:", err);
    }
  }
}
