// Warehouse / object-store export config schemas (Tier 2.4).
//
// A project export config points new traces at a customer-owned destination
// (S3 / GCS / BigQuery / Snowflake). `config` holds only NON-SECRET routing
// information (bucket, region, prefix, dataset, table, ...) — credentials are
// always read from the worker environment (default cloud provider chain),
// never persisted here.
import { z } from "zod";

export const ExportDestinationSchema = z.enum(["s3", "gcs", "bigquery", "snowflake"]);
export type ExportDestination = z.infer<typeof ExportDestinationSchema>;

export const ExportFormatSchema = z.enum(["ndjson", "parquet"]);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;

export const CreateExportConfigSchema = z.object({
  destination: ExportDestinationSchema,
  // Non-secret routing only (e.g. { bucket, region, prefix } for s3,
  // { dataset, table } for bigquery). Never put credentials here.
  config: z.record(z.unknown()),
  format: ExportFormatSchema.default("ndjson"),
  enabled: z.boolean().default(false),
});
export type CreateExportConfig = z.infer<typeof CreateExportConfigSchema>;

// PATCH may update any subset of the create fields. At least one must be
// given. Defined fresh (not `CreateExportConfigSchema.partial()`) so the
// create-side `.default()`s never silently re-apply to omitted PATCH fields.
export const UpdateExportConfigSchema = z
  .object({
    destination: ExportDestinationSchema.optional(),
    config: z.record(z.unknown()).optional(),
    format: ExportFormatSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.destination !== undefined ||
      v.config !== undefined ||
      v.format !== undefined ||
      v.enabled !== undefined,
    { message: "At least one field must be provided" },
  );
export type UpdateExportConfig = z.infer<typeof UpdateExportConfigSchema>;
