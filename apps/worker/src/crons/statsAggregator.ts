import type { Drizzle } from "../types.js";
import { sql } from "drizzle-orm";

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

  console.log("[stats-aggregator] complete for", dateStr);
}
