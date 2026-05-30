import type { Drizzle } from "../types.js";
import { sql } from "drizzle-orm";
import { computeReliabilityScore, gradeBand } from "../lib/reliabilityScore.js";
import { detectRegressions, type ToolSnapshot } from "../lib/regressionDetect.js";
import { deliverSignedWebhooks } from "../lib/signedWebhookDelivery.js";

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

interface ErrorTaxonomyRow {
  tool_slug: string;
  timeout: number | string;
  auth: number | string;
  rate_limit: number | string;
  schema: number | string;
  server_5xx: number | string;
  total_errors: number | string;
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
      lower(trim(ts.tool_name)) AS tool_slug,
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
      AND ts.timestamp >= ${dateStr}::date
      AND ts.timestamp < (${dateStr}::date + INTERVAL '1 day')
    GROUP BY lower(trim(ts.tool_name)), t.project_id
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

  // Error taxonomy: bucket trace_steps.error strings per tool (tool_call steps,
  // sharing orgs only) over the trailing 14 days. Classified in SQL via regex
  // FILTERs in one pass; null/empty errors are successes and excluded.
  const taxonomyRows = await db.execute<ErrorTaxonomyRow>(sql`
    SELECT
      lower(trim(ts.tool_name)) AS tool_slug,
      COUNT(*) FILTER (WHERE ts.error ~* 'timeout|timed out|deadline|etimedout') AS timeout,
      COUNT(*) FILTER (WHERE ts.error ~* 'unauthor|forbidden|invalid.*(key|token|cred)|\\m401\\M|\\m403\\M|auth') AS auth,
      COUNT(*) FILTER (WHERE ts.error ~* 'rate.?limit|too many request|\\m429\\M|throttl') AS rate_limit,
      COUNT(*) FILTER (WHERE ts.error ~* 'schema|validation|invalid.*(arg|param|input|json)|parse|\\m400\\M|\\m422\\M') AS schema,
      COUNT(*) FILTER (WHERE ts.error ~* '\\m50[0-9]\\M|server error|bad gateway|service unavailable') AS server_5xx,
      COUNT(*) AS total_errors
    FROM trace_steps ts
    JOIN traces tr ON tr.id = ts.trace_id
    JOIN projects p ON p.id = tr.project_id
    JOIN organizations o ON o.id = p.org_id
    WHERE ts.type = 'tool_call'
      AND ts.tool_name IS NOT NULL
      AND ts.error IS NOT NULL AND ts.error <> ''
      AND o.share_anonymized_stats = true
      AND ts.timestamp >= (${dateStr}::date - INTERVAL '14 days')
    GROUP BY lower(trim(ts.tool_name))
  `);

  const taxonomyBySlug = new Map<string, string>();
  for (const r of taxonomyRows) {
    const timeout = Number(r.timeout) || 0;
    const auth = Number(r.auth) || 0;
    const rate_limit = Number(r.rate_limit) || 0;
    const schema = Number(r.schema) || 0;
    const server_5xx = Number(r.server_5xx) || 0;
    const total = Number(r.total_errors) || 0;
    // Buckets are non-exclusive regex matches; clamp "other" so the residual is
    // never negative when an error string matches more than one pattern.
    const classified = Math.min(total, timeout + auth + rate_limit + schema + server_5xx);
    const other = Math.max(0, total - classified);
    taxonomyBySlug.set(
      r.tool_slug,
      JSON.stringify({ timeout, auth, rate_limit, schema, "5xx": server_5xx, other }),
    );
  }

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

    const errorTaxonomy = taxonomyBySlug.get(row.tool_slug) ?? null;
    await db.execute(sql`
      UPDATE tool_global_stats
      SET distinct_orgs = ${distinctOrgs},
          cost_per_call_usd = ${costPerCall ?? null},
          reliability_score = ${reliability},
          grade_band = ${band},
          error_taxonomy = ${errorTaxonomy}
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

  // --- Regression "Downdetector" (spec 02) --------------------------------
  await detectAndAlertRegressions(db, dateStr);

  console.log("[stats-aggregator] complete for", dateStr);
}

// Number of trailing days the regression baseline medians over (excludes today).
const REGRESSION_WINDOW_DAYS = 7;
// A definition_hash change within this many days of a regression ⇒ rug_pull.
const RUG_PULL_WINDOW_DAYS = 7;

interface RegressionCandidateRow {
  tool_slug: string;
  category: string;
  distinct_orgs: number;
  definition_changed: boolean;
  cur_success_rate: number | null;
  cur_p95_latency_ms: number | null;
  cur_cost_per_call_usd: number | null;
  cur_total_calls: number | null;
  [key: string]: unknown;
}

interface HistoryRow {
  tool_slug: string;
  success_rate: number | null;
  p95_latency_ms: number | null;
  cost_per_call_usd: number | null;
  total_calls: number | null;
  [key: string]: unknown;
}

/**
 * For every tool with enough cross-org coverage (min-k), diff the current daily
 * snapshot against its trailing-7d medians via the pure detectRegressions
 * helper. Each regression fires a signed `tool_regression` webhook to exactly
 * the projects that called that tool (join tool_stats by tool_slug), with a
 * `suggestedAlternative` = best same-category tool by reliabilityScore.
 */
async function detectAndAlertRegressions(db: Drizzle, dateStr: string): Promise<void> {
  // Current snapshot + min-k gate + rug-pull signal (definition changed within
  // RUG_PULL_WINDOW_DAYS, proxied by tools.updated_at moving forward).
  const candidates = await db.execute<RegressionCandidateRow>(sql`
    SELECT
      h.tool_slug,
      t.category,
      h.distinct_orgs,
      (t.updated_at >= (${dateStr}::date - INTERVAL '${sql.raw(String(RUG_PULL_WINDOW_DAYS))} days')) AS definition_changed,
      h.success_rate::float8 AS cur_success_rate,
      h.p95_latency_ms::float8 AS cur_p95_latency_ms,
      h.cost_per_call_usd::float8 AS cur_cost_per_call_usd,
      h.total_calls::int AS cur_total_calls
    FROM tool_global_stats_history h
    JOIN tools t ON t.slug = h.tool_slug
    WHERE h.date = ${dateStr}::date
      AND h.distinct_orgs >= ${MIN_K_DISTINCT_ORGS}
  `);

  if (candidates.length === 0) return;

  // Trailing history (excluding today) for all candidate tools in one query.
  const slugs = candidates.map((c) => c.tool_slug);
  const history = await db.execute<HistoryRow>(sql`
    SELECT tool_slug, success_rate::float8 AS success_rate,
           p95_latency_ms::float8 AS p95_latency_ms,
           cost_per_call_usd::float8 AS cost_per_call_usd,
           total_calls::int AS total_calls
    FROM tool_global_stats_history
    WHERE tool_slug = ANY(${slugs})
      AND date >= (${dateStr}::date - INTERVAL '${sql.raw(String(REGRESSION_WINDOW_DAYS))} days')
      AND date < ${dateStr}::date
  `);

  const historyBySlug = new Map<string, ToolSnapshot[]>();
  for (const h of history) {
    const list = historyBySlug.get(h.tool_slug) ?? [];
    list.push({
      successRate: h.success_rate,
      p95LatencyMs: h.p95_latency_ms,
      costPerCallUsd: h.cost_per_call_usd,
      totalCalls: h.total_calls,
    });
    historyBySlug.set(h.tool_slug, list);
  }

  for (const c of candidates) {
    const regressions = detectRegressions(
      {
        successRate: c.cur_success_rate,
        p95LatencyMs: c.cur_p95_latency_ms,
        costPerCallUsd: c.cur_cost_per_call_usd,
        totalCalls: c.cur_total_calls,
      },
      historyBySlug.get(c.tool_slug) ?? [],
      { definitionChanged: c.definition_changed },
    );
    if (regressions.length === 0) continue;

    const suggestedAlternative = await bestAlternative(db, c.tool_slug, c.category);

    // Projects that actually called this tool — scope alerts to them only.
    const affected = await db.execute<{ project_id: string }>(sql`
      SELECT DISTINCT project_id FROM tool_stats WHERE tool_slug = ${c.tool_slug}
    `);

    for (const reg of regressions) {
      const payload = {
        event: "tool_regression",
        toolSlug: c.tool_slug,
        kind: reg.kind,
        current: {
          successRate: reg.current.successRate,
          p95LatencyMs: reg.current.p95LatencyMs,
        },
        baseline: {
          successRate: reg.baseline.successRate,
          p95LatencyMs: reg.baseline.p95LatencyMs,
        },
        windowDays: REGRESSION_WINDOW_DAYS,
        suggestedAlternative,
        timestamp: new Date().toISOString(),
      };

      for (const { project_id } of affected) {
        await deliverSignedWebhooks(db, project_id, "tool_regression", payload).catch((e) =>
          console.error("[stats-aggregator] tool_regression webhook failed:", e),
        );
      }
    }
  }
}

/** Best same-category alternative tool by reliabilityScore, excluding the slug itself. */
async function bestAlternative(
  db: Drizzle,
  toolSlug: string,
  category: string,
): Promise<string | null> {
  const rows = await db.execute<{ slug: string }>(sql`
    SELECT t.slug
    FROM tools t
    JOIN tool_global_stats tgs ON tgs.tool_slug = t.slug
    WHERE t.category = ${category}
      AND t.slug <> ${toolSlug}
      AND tgs.reliability_score IS NOT NULL
    ORDER BY tgs.reliability_score DESC
    LIMIT 1
  `);
  return rows[0]?.slug ?? null;
}
