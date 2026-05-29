import type { Exporter } from "./types.js";
import { createS3Exporter } from "./s3Exporter.js";

// Destinations other than s3 are documented stubs: we throw a clear,
// actionable error (caught per-config in the cron) rather than failing
// silently or pulling in SDKs/credentials we don't yet support.
const NOT_IMPLEMENTED: Record<string, string> = {
  gcs: "gcs export not yet implemented — needs @google-cloud/storage + credentials",
  bigquery: "bigquery export not yet implemented — needs @google-cloud/bigquery + credentials",
  snowflake: "snowflake export not yet implemented — needs snowflake-sdk + credentials",
};

/**
 * Resolve an Exporter for a destination. `config` is the parsed, non-secret
 * routing object from the project's export config.
 */
export function getExporter(destination: string, config: Record<string, unknown>): Exporter {
  if (destination === "s3") return createS3Exporter(config);

  const message = NOT_IMPLEMENTED[destination];
  if (message) throw new Error(message);

  throw new Error(`unknown export destination: ${destination}`);
}
