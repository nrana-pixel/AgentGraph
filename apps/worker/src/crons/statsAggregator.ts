import type { Drizzle } from "../types.js";
import { sql } from "drizzle-orm";
import {
  computeReliabilityScore,
  gradeBand,
} from "../lib/reliabilityScore.js";

// Min-k anonymity threshold — a reliability score is only published once at
// least this many distinct sharing orgs contribute, so a niche tool used by a
// single org can't have its numbers reverse-engineered. See spec 01 / governance.
const MIN_K_DISTINCT_ORGS = 3;

interface ReliabilityRow {
  tool_slug: string;
  success_rate: number | null;
  p95_latency_ms: number | null;
  category_p95_median: number | null;
  consistency: number | null;
  distinct_orgs: number;
  cost_per_call_usd: number | null;
  total_calls: number;
  [key: string]: unknown;
}

/**
 * Daily cron — runs at 02:00 UTC.
 * Aggregates yesterday's trace_steps into tool_stats (per-project)
 * and then re-derives tool_global_stats (anonymised, cross-project).
 */
export async function runStatsAggregator(db: Drizzle): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);

  console.log("[stats-aggregator] aggregating for date:", dateStr);

  // Upsert per-project tool stats for yesterday
  await db.execute(sql`
    INSERT INTO tool_stats (id, tool_slug, project_id, date, call_count, success_count, error_count, avg_latency_ms, p95_latency_ms, total_cost_usd)
    SELECT
      gen_random_uuid(),
      ts.tool_name AS tool_slug,
      t.project_id,
      ${dateStr}::date AS date,
      COUNT(*) AS call_count,
      COUNT(*) FILTER (WHERE ts.error IS NULL) AS success_count,
      COUNT(*) FILTER (WHERE ts.error IS NOT NULL) AS error_count,
      AVG(ts.latency_ms) AS avg_latency_ms,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ts.latency_ms) AS p95_latency_ms,
      SUM(ts.cost_usd::numeric) AS total_cost_usd
    FROM trace_steps ts
    JOIN traces t ON t.id = ts.trace_id
    WHERE ts.type = 'tool_call'
      AND ts.tool_name IS NOT NULL
      AND DATE(ts.timestamp) = ${dateStr}::date
    GROUP BY ts.tool_name, t.project_id
    ON CONFLICT (tool_slug, project_id, date)
    DO UPDATE SET
      call_count = EXCLUDED.call_count,
      success_count = EXCLUDED.success_count,
      error_count = EXCLUDED.error_count,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      p95_latency_ms = EXCLUDED.p95_latency_ms,
      total_cost_usd = EXCLUDED.total_cost_usd
  `);

  // Re-derive global stats from all active tool_stats
  // max_calls_in_category for log-normalised popularity score
  await db.execute(sql`
    INSERT INTO tool_global_stats (tool_slug, total_calls, success_rate, avg_latency_ms, p95_latency_ms, popularity_score, last_updated)
    WITH per_tool AS (
      SELECT
        ts.tool_slug,
        SUM(ts.call_count) AS total_calls,
        CASE WHEN SUM(ts.call_count) > 0
          THEN SUM(ts.success_count)::numeric / SUM(ts.call_count)
          ELSE NULL
        END AS success_rate,
        AVG(ts.avg_latency_ms) AS avg_latency_ms,
        MAX(ts.p95_latency_ms) AS p95_latency_ms
      FROM tool_stats ts
      -- Only orgs that opted into sharing contribute to the cross-project pool.
      -- Per-project tool_stats above are unaffected; this gates the shared
      -- global benchmark only. See docs/DATA_GOVERNANCE.md.
      JOIN projects p ON p.id = ts.project_id
      JOIN organizations o ON o.id = p.org_id
      WHERE o.share_anonymized_stats = true
      GROUP BY ts.tool_slug
    ),
    category_max AS (
      SELECT
        t.category,
        MAX(pt.total_calls) AS max_calls
      FROM per_tool pt
      JOIN tools t ON t.slug = pt.tool_slug
      GROUP BY t.category
    )
    SELECT
      pt.tool_slug,
      pt.total_calls,
      pt.success_rate,
      pt.avg_latency_ms,
      pt.p95_latency_ms,
      CASE WHEN cm.max_calls > 0
        THEN LOG(pt.total_calls + 1) / NULLIF(LOG(cm.max_calls + 1), 0) * 100
        ELSE 0
      END AS popularity_score,
      NOW() AS last_updated
    FROM per_tool pt
    JOIN tools t ON t.slug = pt.tool_slug
    JOIN category_max cm ON cm.category = t.category
    ON CONFLICT (tool_slug) DO UPDATE SET
      total_calls = EXCLUDED.total_calls,
      success_rate = EXCLUDED.success_rate,
      avg_latency_ms = EXCLUDED.avg_latency_ms,
      p95_latency_ms = EXCLUDED.p95_latency_ms,
      popularity_score = EXCLUDED.popularity_score,
      last_updated = EXCLUDED.last_updated
  `);

  // Graduate tools from 'seeded' to 'telemetry' once they have 50+ real calls
  await db.execute(sql`
    UPDATE tools
    SET data_source = 'telemetry', updated_at = NOW()
    FROM tool_global_stats tgs
    WHERE tools.slug = tgs.tool_slug
      AND tools.data_source = 'seeded'
      AND tgs.total_calls >= 50
  `);

  // --- Reliability Score (spec 01) --------------------------------------
  // Gather the per-tool inputs the score needs. Everything here is scoped to
  // sharing orgs only (same gate as the global-stats pool above), so opted-out
  // orgs neither count toward distinctOrgs nor the pooled numbers.
  //
  // consistency = 1 - normalised stddev of the daily success rate over the
  // trailing 14 days. STDDEV_SAMP is null for a single day, in which case we
  // fall back to a neutral 1.0 (no penalty until we have a trend).
  const reliabilityRows = await db.execute<ReliabilityRow>(sql`
    WITH shared_stats AS (
      SELECT ts.*
      FROM tool_stats ts
      JOIN projects p ON p.id = ts.project_id
      JOIN organizations o ON o.id = p.org_id
      WHERE o.share_anonymized_stats = true
    ),
    per_tool AS (
      SELECT
        ss.tool_slug,
        COUNT(DISTINCT p.org_id)::int AS distinct_orgs,
        CASE WHEN SUM(ss.call_count) > 0
          THEN SUM(ss.total_cost_usd::numeric) / SUM(ss.call_count)
          ELSE NULL
        END AS cost_per_call_usd
      FROM shared_stats ss
      JOIN projects p ON p.id = ss.project_id
      GROUP BY ss.tool_slug
    ),
    daily_success AS (
      -- One success rate per tool per day (across the trailing 14 days),
      -- weighting projects by call volume.
      SELECT
        ss.tool_slug,
        ss.date,
        CASE WHEN SUM(ss.call_count) > 0
          THEN SUM(ss.success_count)::numeric / SUM(ss.call_count)
          ELSE NULL
        END AS day_success_rate
      FROM shared_stats ss
      WHERE ss.date >= (${dateStr}::date - INTERVAL '14 days')
      GROUP BY ss.tool_slug, ss.date
    ),
    consistency AS (
      SELECT
        ds.tool_slug,
        -- 1 - stddev, clamped to [0,1]. Null stddev (single day) -> neutral 1.0.
        GREATEST(0, 1 - COALESCE(STDDEV_SAMP(ds.day_success_rate), 0)) AS consistency
      FROM daily_success ds
      GROUP BY ds.tool_slug
    ),
    category_p95 AS (
      SELECT
        t.category,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY tgs.p95_latency_ms) AS category_p95_median
      FROM tool_global_stats tgs
      JOIN tools t ON t.slug = tgs.tool_slug
      WHERE tgs.p95_latency_ms IS NOT NULL
      GROUP BY t.category
    )
    SELECT
      tgs.tool_slug,
      tgs.success_rate::float8 AS success_rate,
      tgs.p95_latency_ms::float8 AS p95_latency_ms,
      cp.category_p95_median::float8 AS category_p95_median,
      c.consistency::float8 AS consistency,
      COALESCE(pt.distinct_orgs, 0) AS distinct_orgs,
      pt.cost_per_call_usd::float8 AS cost_per_call_usd,
      tgs.total_calls::int AS total_calls
    FROM tool_global_stats tgs
    JOIN tools t ON t.slug = tgs.tool_slug
    LEFT JOIN per_tool pt ON pt.tool_slug = tgs.tool_slug
    LEFT JOIN consistency c ON c.tool_slug = tgs.tool_slug
    LEFT JOIN category_p95 cp ON cp.category = t.category
  `);

  for (const row of reliabilityRows) {
    const distinctOrgs = row.distinct_orgs ?? 0;
    const costPerCall = row.cost_per_call_usd;

    // Min-k anonymity gate: only publish a score when >= K distinct sharing orgs.
    let reliability: number | null = null;
    let band: string | null = null;
    if (distinctOrgs >= MIN_K_DISTINCT_ORGS) {
      reliability = computeReliabilityScore({
        successRate: row.success_rate ?? 0,
        p95LatencyMs: row.p95_latency_ms ?? 0,
        categoryP95Median: row.category_p95_median ?? 0,
        consistency: row.consistency ?? 1,
        distinctOrgs,
        totalCalls: row.total_calls ?? 0,
      });
      band = gradeBand(reliability);
    }

    // errorTaxonomy is left null for v1 — bucketing trace_steps.error strings
    // is deferred. TODO(spec01): derive { timeout, auth, rate_limit, schema,
    // "5xx", other } via a regex map during the per-project rollup.
    await db.execute(sql`
      UPDATE tool_global_stats
      SET distinct_orgs = ${distinctOrgs},
          cost_per_call_usd = ${costPerCall ?? null},
          reliability_score = ${reliability},
          grade_band = ${band}
      WHERE tool_slug = ${row.tool_slug}
    `);
  }

  // --- Daily history snapshot (unblocks spec 02 regression detection) ----
  await db.execute(sql`
    INSERT INTO tool_global_stats_history
      (id, tool_slug, date, success_rate, p95_latency_ms, cost_per_call_usd, total_calls, distinct_orgs)
    SELECT
      gen_random_uuid(),
      tgs.tool_slug,
      ${dateStr}::date,
      tgs.success_rate,
      tgs.p95_latency_ms,
      tgs.cost_per_call_usd,
      tgs.total_calls,
      tgs.distinct_orgs
    FROM tool_global_stats tgs
    ON CONFLICT (tool_slug, date) DO UPDATE SET
      success_rate = EXCLUDED.success_rate,
      p95_latency_ms = EXCLUDED.p95_latency_ms,
      cost_per_call_usd = EXCLUDED.cost_per_call_usd,
      total_calls = EXCLUDED.total_calls,
      distinct_orgs = EXCLUDED.distinct_orgs
  `);

  console.log("[stats-aggregator] complete for", dateStr);
}
