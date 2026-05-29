import { and, eq, isNotNull, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { traces, traceSteps, toolUsageStats, tools } from "../db/schema.js";
import type { ToolUsageResponse, ToolUsageRow } from "@agentgraph/types";

// Recompute the project's tool-usage rollup at most this often. The rollup is
// computed lazily on read (no worker cron): when the cached rows are stale or
// missing we recompute the whole project's set in one aggregation, otherwise we
// serve the cache.
const STALE_AFTER_MS = 60 * 60 * 1000; // ~1h

interface UsageAggRow {
  toolSlug: string;
  calls: number;
  errorCount: number;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  totalCostUsd: number | null;
}

/**
 * Aggregate trace_steps (scoped to the project via traces) into per-tool stats.
 * Only `type = 'tool_call'` steps with a non-null tool_name are counted.
 * Latency percentiles use postgres `percentile_cont`. Pure DB read — no caching.
 */
export async function computeToolUsage(projectId: string): Promise<UsageAggRow[]> {
  const rows = await db
    .select({
      toolSlug: traceSteps.toolName,
      calls: sql<number>`COUNT(*)::int`.as("calls"),
      errorCount:
        sql<number>`COUNT(*) FILTER (WHERE ${traceSteps.error} IS NOT NULL)::int`.as(
          "error_count",
        ),
      avgLatencyMs:
        sql<number | null>`ROUND(AVG(${traceSteps.latencyMs})::numeric, 2)::float8`.as(
          "avg_latency_ms",
        ),
      p50LatencyMs:
        sql<number | null>`ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY ${traceSteps.latencyMs})::numeric, 2)::float8`.as(
          "p50_latency_ms",
        ),
      p95LatencyMs:
        sql<number | null>`ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${traceSteps.latencyMs})::numeric, 2)::float8`.as(
          "p95_latency_ms",
        ),
      totalCostUsd:
        sql<number | null>`ROUND(COALESCE(SUM(${traceSteps.costUsd}::numeric), 0), 6)::float8`.as(
          "total_cost_usd",
        ),
    })
    .from(traceSteps)
    .innerJoin(traces, eq(traceSteps.traceId, traces.id))
    .where(
      and(
        eq(traces.projectId, projectId),
        eq(traceSteps.type, "tool_call"),
        isNotNull(traceSteps.toolName),
      ),
    )
    .groupBy(traceSteps.toolName);

  return rows.map((r) => ({
    toolSlug: r.toolSlug as string,
    calls: r.calls,
    errorCount: r.errorCount,
    avgLatencyMs: r.avgLatencyMs,
    p50LatencyMs: r.p50LatencyMs,
    p95LatencyMs: r.p95LatencyMs,
    totalCostUsd: r.totalCostUsd,
  }));
}

/**
 * Upsert the computed rows into tool_usage_stats on the
 * (project_id, tool_slug) unique index, stamping last_computed_at = now().
 */
async function cacheToolUsage(
  projectId: string,
  rows: UsageAggRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await db
    .insert(toolUsageStats)
    .values(
      rows.map((r) => ({
        projectId,
        toolSlug: r.toolSlug,
        calls: r.calls,
        errorCount: r.errorCount,
        avgLatencyMs: r.avgLatencyMs !== null ? String(r.avgLatencyMs) : null,
        p50LatencyMs: r.p50LatencyMs !== null ? String(r.p50LatencyMs) : null,
        p95LatencyMs: r.p95LatencyMs !== null ? String(r.p95LatencyMs) : null,
        totalCostUsd: r.totalCostUsd !== null ? String(r.totalCostUsd) : null,
        lastComputedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: [toolUsageStats.projectId, toolUsageStats.toolSlug],
      set: {
        calls: sql`excluded.calls`,
        errorCount: sql`excluded.error_count`,
        avgLatencyMs: sql`excluded.avg_latency_ms`,
        p50LatencyMs: sql`excluded.p50_latency_ms`,
        p95LatencyMs: sql`excluded.p95_latency_ms`,
        totalCostUsd: sql`excluded.total_cost_usd`,
        lastComputedAt: sql`excluded.last_computed_at`,
      },
    });
}

/**
 * getToolUsage(projectId): the public entrypoint. Serves cached rows from
 * tool_usage_stats when fresh (any row computed within STALE_AFTER_MS); otherwise
 * recomputes the whole project's set from trace_steps and upserts the cache.
 */
export async function getToolUsage(projectId: string): Promise<ToolUsageResponse> {
  const cached = await db
    .select()
    .from(toolUsageStats)
    .where(eq(toolUsageStats.projectId, projectId));

  const newestComputedAt = cached.reduce<Date | null>((acc, row) => {
    const t = row.lastComputedAt;
    if (!t) return acc;
    return acc === null || t > acc ? t : acc;
  }, null);

  const isFresh =
    cached.length > 0 &&
    newestComputedAt !== null &&
    Date.now() - newestComputedAt.getTime() < STALE_AFTER_MS;

  let aggRows: UsageAggRow[];
  let computedAt: Date;

  if (isFresh) {
    aggRows = cached.map((r) => ({
      toolSlug: r.toolSlug,
      calls: r.calls,
      errorCount: r.errorCount,
      avgLatencyMs: r.avgLatencyMs !== null ? Number(r.avgLatencyMs) : null,
      p50LatencyMs: r.p50LatencyMs !== null ? Number(r.p50LatencyMs) : null,
      p95LatencyMs: r.p95LatencyMs !== null ? Number(r.p95LatencyMs) : null,
      totalCostUsd: r.totalCostUsd !== null ? Number(r.totalCostUsd) : null,
    }));
    computedAt = newestComputedAt!;
  } else {
    aggRows = await computeToolUsage(projectId);
    await cacheToolUsage(projectId, aggRows);
    computedAt = new Date();
  }

  const catalogSlugs = await catalogMembership(aggRows.map((r) => r.toolSlug));

  const toolRows: ToolUsageRow[] = aggRows
    .map((r) => buildUsageRow(r, catalogSlugs.has(r.toolSlug)))
    .sort((a, b) => b.calls - a.calls);

  return {
    projectId,
    tools: toolRows,
    computedAt: computedAt.toISOString(),
  };
}

// Which of these observed tool names exist in the catalog (slug-equality only).
async function catalogMembership(slugs: string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const rows = await db
    .select({ slug: tools.slug })
    .from(tools)
    .where(inArray(tools.slug, slugs));
  return new Set(rows.map((r) => r.slug));
}

// Pure: shape an aggregation row into the API response row (computes errorRate).
export function buildUsageRow(r: UsageAggRow, inCatalog: boolean): ToolUsageRow {
  return {
    toolSlug: r.toolSlug,
    calls: r.calls,
    errorCount: r.errorCount,
    errorRate: r.calls > 0 ? r.errorCount / r.calls : 0,
    avgLatencyMs: r.avgLatencyMs,
    p50LatencyMs: r.p50LatencyMs,
    p95LatencyMs: r.p95LatencyMs,
    totalCostUsd: r.totalCostUsd,
    inCatalog,
  };
}

export type { UsageAggRow };
