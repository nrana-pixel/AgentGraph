// Common contract for warehouse / object-store exporters (Tier 2.4).
//
// An exporter receives an already-serialized NDJSON payload (one trace per
// line) plus light metadata, and ships it to its destination. Implementations
// read non-secret routing from their construction-time config and credentials
// from the worker environment — never from the database.

/** One trace serialized for warehouse export. Kept structural so consumers
 *  (BigQuery / Snowflake) can ingest it without re-parsing nested strings. */
export interface ExportRow {
  id: string;
  projectId: string;
  agentId: string;
  status: string;
  env: string;
  totalCostUsd: number | null;
  totalTokens: number | null;
  totalLatencyMs: number | null;
  startedAt: string | null;
  endedAt: string | null;
  metadata: unknown;
}

export interface Exporter {
  /** Stable identifier for logging (matches the destination enum value). */
  readonly name: string;
  /**
   * Ship one batch of NDJSON. `meta.cursor` is the ISO timestamp of the
   * batch's high-water mark and is used to build a unique object key.
   */
  export(ndjson: string, meta: { projectId: string; cursor: string }): Promise<void>;
}
