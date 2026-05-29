import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Exporter } from "./types.js";

// ---------------------------------------------------------------------------
// S3 object-store exporter (Tier 2.4)
//
// Writes one NDJSON object per export batch under a deterministic key:
//   ${prefix}/${projectId}/${cursorISO}.ndjson
//
// Credentials come from the worker ENVIRONMENT only — the default AWS provider
// chain (env vars, shared config, IMDS, ...). We never read keys from the DB.
// Only non-secret routing (bucket, region, prefix) is taken from the config.
// ---------------------------------------------------------------------------

export interface S3ExporterConfig {
  bucket: string;
  region?: string;
  prefix?: string;
}

/** Pull and validate the non-secret S3 routing from a config record. */
function parseConfig(config: Record<string, unknown>): S3ExporterConfig {
  const bucket = config["bucket"];
  if (typeof bucket !== "string" || bucket.length === 0) {
    throw new Error("s3 export config requires a non-empty `bucket`");
  }
  const out: S3ExporterConfig = { bucket };
  if (typeof config["region"] === "string") out.region = config["region"];
  if (typeof config["prefix"] === "string") {
    // Normalise the prefix: trim surrounding slashes so the key joins cleanly.
    const prefix = config["prefix"].replace(/^\/+|\/+$/g, "");
    if (prefix) out.prefix = prefix;
  }
  return out;
}

export function createS3Exporter(config: Record<string, unknown>): Exporter {
  const { bucket, region, prefix } = parseConfig(config);

  // Region from config; credentials from the default provider chain.
  const client = new S3Client(region ? { region } : {});

  return {
    name: "s3",
    async export(ndjson, meta) {
      const segments = [prefix, meta.projectId, `${meta.cursor}.ndjson`].filter(
        (s): s is string => Boolean(s),
      );
      const key = segments.join("/");

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: ndjson,
          ContentType: "application/x-ndjson",
        }),
      );
    },
  };
}
