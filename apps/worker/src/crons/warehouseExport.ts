import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import type { Drizzle } from "../types.js";
import { projectExportConfigs, traces, type Trace } from "../db/schema.js";
import { getExporter } from "../lib/exporters/index.js";
import type { ExportRow } from "../lib/exporters/types.js";

// ---------------------------------------------------------------------------
// Warehouse / object-store export cron (Tier 2.4)
//
// For each enabled project_export_configs row, ship traces newer than the
// config's high-water mark to its destination, then advance the cursor. Each
// config is isolated in a try/catch so one bad destination never blocks the
// rest. Credentials live in the worker environment; only non-secret routing
// is read from the config row.
// ---------------------------------------------------------------------------

const MAX_ROWS_PER_RUN = 5000;

/** Columns we serialize, in the order we select them. */
type ExportableTrace = Pick<
  Trace,
  | "id"
  | "projectId"
  | "agentId"
  | "status"
  | "env"
  | "totalCostUsd"
  | "totalTokens"
  | "totalLatencyMs"
  | "startedAt"
  | "endedAt"
  | "metadata"
>;

/** Parse the metadata text column to an object; fall back to {} on bad JSON. */
function parseMetadata(raw: string | null): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Pure: serialize trace rows to NDJSON (one JSON object per line).
 *
 * `metadata` is stored as a JSON *string* in the DB; we parse it back to a
 * nested object so warehouse consumers (BigQuery/Snowflake) get structured
 * data, not a stringified string. `totalCostUsd` is a numeric stored as a
 * string by the driver — coerced to a number. Timestamps become ISO strings.
 */
export function tracesToNdjson(rows: ExportableTrace[]): string {
  return rows
    .map((t) => {
      const row: ExportRow = {
        id: t.id,
        projectId: t.projectId,
        agentId: t.agentId,
        status: t.status,
        env: t.env,
        totalCostUsd: t.totalCostUsd != null ? Number(t.totalCostUsd) : null,
        totalTokens: t.totalTokens ?? null,
        totalLatencyMs: t.totalLatencyMs ?? null,
        startedAt: t.startedAt ? t.startedAt.toISOString() : null,
        endedAt: t.endedAt ? t.endedAt.toISOString() : null,
        metadata: parseMetadata(t.metadata),
      };
      return JSON.stringify(row);
    })
    .join("\n");
}

/**
 * Pure: the latest non-null `startedAt` across rows, or null if none. Used to
 * advance the high-water mark. Null timestamps are ignored so a single null
 * row never produces an Invalid Date cursor.
 */
export function maxStartedAt(rows: Array<{ startedAt: Date | null }>): Date | null {
  let max: Date | null = null;
  for (const r of rows) {
    if (r.startedAt && (max === null || r.startedAt > max)) max = r.startedAt;
  }
  return max;
}

export async function runWarehouseExport(db: Drizzle): Promise<void> {
  const configs = await db
    .select()
    .from(projectExportConfigs)
    .where(eq(projectExportConfigs.enabled, true));

  if (configs.length === 0) {
    console.log("[warehouse-export] no enabled configs; skipping");
    return;
  }

  console.log(`[warehouse-export] processing ${configs.length} config(s)`);

  for (const config of configs) {
    try {
      if (config.format === "parquet") {
        throw new Error("parquet export not yet implemented — only ndjson is supported");
      }

      // Strict `>` cursor: rows at exactly the cursor were shipped last run.
      const conditions = [
        eq(traces.projectId, config.projectId),
        isNotNull(traces.startedAt),
      ];
      if (config.highWaterMark) {
        conditions.push(gt(traces.startedAt, config.highWaterMark));
      }

      const rows = await db
        .select({
          id: traces.id,
          projectId: traces.projectId,
          agentId: traces.agentId,
          status: traces.status,
          env: traces.env,
          totalCostUsd: traces.totalCostUsd,
          totalTokens: traces.totalTokens,
          totalLatencyMs: traces.totalLatencyMs,
          startedAt: traces.startedAt,
          endedAt: traces.endedAt,
          metadata: traces.metadata,
        })
        .from(traces)
        .where(and(...conditions))
        .orderBy(asc(traces.startedAt))
        .limit(MAX_ROWS_PER_RUN);

      if (rows.length === 0) {
        // Still record that we ran (for visibility), without moving the cursor.
        await db
          .update(projectExportConfigs)
          .set({ lastRunAt: new Date() })
          .where(eq(projectExportConfigs.id, config.id));
        continue;
      }

      const cursor = maxStartedAt(rows);
      if (!cursor) {
        // Defensive: isNotNull filter should make this unreachable.
        throw new Error("no valid startedAt among exported rows");
      }

      const exporter = getExporter(config.destination, JSON.parse(config.config));
      const ndjson = tracesToNdjson(rows);
      await exporter.export(ndjson, {
        projectId: config.projectId,
        cursor: cursor.toISOString(),
      });

      await db
        .update(projectExportConfigs)
        .set({ highWaterMark: cursor, lastRunAt: new Date() })
        .where(eq(projectExportConfigs.id, config.id));

      console.log(
        `[warehouse-export] exported ${rows.length} trace(s) for project ${config.projectId} to ${config.destination}`,
      );
    } catch (err) {
      console.error(
        `[warehouse-export] export failed for config ${config.id} (project ${config.projectId}):`,
        err,
      );
    }
  }

  console.log("[warehouse-export] complete");
}
