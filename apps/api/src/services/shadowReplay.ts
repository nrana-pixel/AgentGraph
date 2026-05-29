import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { traces, traceSteps, tools, toolGlobalStats } from "../db/schema.js";
import type { ShadowMetric, ShadowReplayResponse } from "@agentgraph/types";

// ---------------------------------------------------------------------------
// Shadow mode = OFFLINE replay scoring. There is NO live routing and NO proxy.
// We take the steps a project ALREADY recorded for `currentTool` over the last
// `windowDays`, and ESTIMATE what a candidate tool would have done by applying
// the candidate's catalog/global benchmark stats to that same call volume.
// ---------------------------------------------------------------------------

// Observed stats for the current tool over the window.
interface ObservedStats {
  calls: number;
  errorCount: number;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  totalCostUsd: number | null;
}

// Candidate's benchmark stats from the catalog (toolGlobalStats).
interface CandidateStats {
  successRate: number | null; // 0–1
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
}

interface Projection {
  callsAnalyzed: number;
  p50LatencyMs: ShadowMetric;
  p95LatencyMs: ShadowMetric;
  errorRate: ShadowMetric;
  costUsd: ShadowMetric;
  netLatencyImprovementMs: number | null;
  notes: string[];
}

/**
 * Pure projection: given observed actuals for the current tool and the
 * candidate's benchmark stats, produce an observed-vs-projected comparison.
 *
 * Projection method (documented estimate, NOT a guarantee):
 *   - projected p95 latency  = candidate's catalog p95 (same call volume assumed)
 *   - projected p50 latency  = candidate's catalog avg latency (no catalog p50 exists)
 *   - projected error rate   = 1 - candidate's catalog success rate
 *   - projected cost         = null (no per-tool cost benchmark in the catalog)
 * Each projection is null when the candidate lacks that benchmark.
 */
export function projectShadowReplay(
  observed: ObservedStats,
  candidate: CandidateStats,
): Projection {
  const notes: string[] = [
    "Projection is an estimate: candidate latency and error rate are derived from the candidate's catalog benchmark stats applied to your observed call volume; actual results will vary.",
  ];

  const observedErrorRate =
    observed.calls > 0 ? observed.errorCount / observed.calls : null;
  const projectedErrorRate =
    candidate.successRate !== null ? 1 - candidate.successRate : null;
  if (candidate.successRate === null) {
    notes.push("Candidate has no benchmark success rate; error-rate projection unavailable.");
  }

  const projectedP95 = candidate.p95LatencyMs;
  if (projectedP95 === null) {
    notes.push("Candidate has no benchmark p95 latency; latency projection unavailable.");
  }
  // No catalog p50 exists — use candidate avg latency as the p50 proxy.
  const projectedP50 = candidate.avgLatencyMs;

  notes.push("Cost cannot be projected: the catalog has no per-tool cost benchmark. Observed cost is shown for context only.");

  const p95Metric = makeMetric(observed.p95LatencyMs, projectedP95);

  return {
    callsAnalyzed: observed.calls,
    p50LatencyMs: makeMetric(observed.p50LatencyMs, projectedP50),
    p95LatencyMs: p95Metric,
    errorRate: makeMetric(observedErrorRate, projectedErrorRate),
    // observed total cost; projected stays null (see note above)
    costUsd: makeMetric(observed.totalCostUsd, null),
    // positive = candidate is faster at p95 (observed - projected)
    netLatencyImprovementMs:
      observed.p95LatencyMs !== null && projectedP95 !== null
        ? Math.round(observed.p95LatencyMs - projectedP95)
        : null,
    notes,
  };
}

function makeMetric(
  observed: number | null,
  projected: number | null,
): ShadowMetric {
  return {
    observed,
    projected,
    delta: observed !== null && projected !== null ? projected - observed : null,
  };
}

/**
 * replayToolSwap: offline-replay the project's recorded usage of `currentTool`
 * against the `candidateSlug` catalog benchmark, over the last `windowDays`.
 */
export async function replayToolSwap(
  projectId: string,
  currentTool: string,
  candidateSlug: string,
  windowDays = 14,
): Promise<ShadowReplayResponse> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const [observedRow] = await db
    .select({
      calls: sql<number>`COUNT(*)::int`,
      errorCount: sql<number>`COUNT(*) FILTER (WHERE ${traceSteps.error} IS NOT NULL)::int`,
      p50LatencyMs: sql<
        number | null
      >`ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${traceSteps.latencyMs})::numeric, 2)::float8`,
      p95LatencyMs: sql<
        number | null
      >`ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${traceSteps.latencyMs})::numeric, 2)::float8`,
      totalCostUsd: sql<
        number | null
      >`ROUND(COALESCE(SUM(${traceSteps.costUsd}::numeric), 0), 6)::float8`,
    })
    .from(traceSteps)
    .innerJoin(traces, eq(traceSteps.traceId, traces.id))
    .where(
      and(
        eq(traces.projectId, projectId),
        eq(traceSteps.type, "tool_call"),
        eq(traceSteps.toolName, currentTool),
        isNotNull(traceSteps.toolName),
        gte(traceSteps.timestamp, since),
      ),
    );

  const observed: ObservedStats = {
    calls: observedRow?.calls ?? 0,
    errorCount: observedRow?.errorCount ?? 0,
    p50LatencyMs: observedRow?.p50LatencyMs ?? null,
    p95LatencyMs: observedRow?.p95LatencyMs ?? null,
    totalCostUsd: observedRow?.totalCostUsd ?? null,
  };

  const [candidateRow] = await db
    .select({
      slug: tools.slug,
      successRate: toolGlobalStats.successRate,
      avgLatencyMs: toolGlobalStats.avgLatencyMs,
      p95LatencyMs: toolGlobalStats.p95LatencyMs,
    })
    .from(tools)
    .leftJoin(toolGlobalStats, eq(tools.slug, toolGlobalStats.toolSlug))
    .where(eq(tools.slug, candidateSlug));

  const candidate: CandidateStats = {
    successRate:
      candidateRow?.successRate != null ? Number(candidateRow.successRate) : null,
    avgLatencyMs:
      candidateRow?.avgLatencyMs != null ? Number(candidateRow.avgLatencyMs) : null,
    p95LatencyMs:
      candidateRow?.p95LatencyMs != null ? Number(candidateRow.p95LatencyMs) : null,
  };

  const projection = projectShadowReplay(observed, candidate);
  if (!candidateRow) {
    projection.notes.push(`Candidate "${candidateSlug}" is not in the tool catalog; no benchmark available.`);
  }

  return {
    projectId,
    currentTool,
    candidateSlug,
    windowDays,
    callsAnalyzed: projection.callsAnalyzed,
    p50LatencyMs: projection.p50LatencyMs,
    p95LatencyMs: projection.p95LatencyMs,
    errorRate: projection.errorRate,
    costUsd: projection.costUsd,
    netLatencyImprovementMs: projection.netLatencyImprovementMs,
    notes: projection.notes,
    computedAt: new Date().toISOString(),
  };
}

export type { ObservedStats, CandidateStats, Projection };
