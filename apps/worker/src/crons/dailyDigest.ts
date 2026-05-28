import type { Drizzle } from "../types.js";
import { sql } from "drizzle-orm";
import { deliverSignedWebhooks } from "../lib/signedWebhookDelivery.js";

interface DigestRow {
  project_id: string;
  trace_count: number;
  total_cost_usd: number;
  total_tokens: number;
  error_count: number;
  [key: string]: unknown;
}

/**
 * Daily cron — runs once per day.
 * For each project with at least one enabled webhook subscribed to
 * `daily_digest`, aggregates yesterday's (UTC) spend and fires a digest
 * webhook. Projects without an eligible webhook are skipped before any
 * aggregation runs.
 */
export async function runDailyDigest(db: Drizzle): Promise<void> {
  // Yesterday in UTC: [start of yesterday, start of today)
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setUTCDate(startOfYesterday.getUTCDate() - 1);
  const dateStr = startOfYesterday.toISOString().slice(0, 10);

  // Eligible projects first — only those with an enabled webhook subscribed
  // to daily_digest. Avoids aggregating projects we'd discard.
  const eligible = await db.execute<{ project_id: string; [key: string]: unknown }>(sql`
    SELECT DISTINCT project_id
    FROM webhooks
    WHERE enabled = true
      AND 'daily_digest' = ANY(events)
  `);

  const projectIds = eligible.map((r) => r.project_id);
  if (projectIds.length === 0) {
    console.log("[daily-digest] no projects subscribed; skipping");
    return;
  }

  console.log(`[daily-digest] aggregating ${dateStr} for ${projectIds.length} project(s)`);

  const rows = await db.execute<DigestRow>(sql`
    SELECT
      project_id,
      COUNT(*)::int AS trace_count,
      COALESCE(SUM(total_cost_usd::numeric), 0)::float8 AS total_cost_usd,
      COALESCE(SUM(total_tokens), 0)::int AS total_tokens,
      COUNT(*) FILTER (WHERE status = 'error')::int AS error_count
    FROM traces
    WHERE project_id = ANY(${projectIds})
      AND started_at >= ${startOfYesterday.toISOString()}
      AND started_at < ${startOfToday.toISOString()}
    GROUP BY project_id
  `);

  const byProject = new Map(rows.map((r) => [r.project_id, r]));

  for (const projectId of projectIds) {
    const agg = byProject.get(projectId);
    await deliverSignedWebhooks(db, projectId, "daily_digest", {
      event: "daily_digest",
      projectId,
      date: dateStr,
      traceCount: agg ? Number(agg.trace_count) : 0,
      totalCostUsd: agg ? Number(agg.total_cost_usd) : 0,
      totalTokens: agg ? Number(agg.total_tokens) : 0,
      errorCount: agg ? Number(agg.error_count) : 0,
      timestamp: new Date().toISOString(),
    }).catch((e) => console.error(`[daily-digest] delivery failed for ${projectId}:`, e));
  }

  console.log("[daily-digest] complete for", dateStr);
}
