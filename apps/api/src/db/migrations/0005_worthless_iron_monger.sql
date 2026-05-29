CREATE TABLE IF NOT EXISTS "project_export_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"destination" text NOT NULL,
	"config" text DEFAULT '{}' NOT NULL,
	"format" text DEFAULT 'ndjson' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"high_water_mark" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_usage_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tool_slug" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" numeric(10, 2),
	"p50_latency_ms" numeric(10, 2),
	"p95_latency_ms" numeric(10, 2),
	"total_cost_usd" numeric(12, 6),
	"last_computed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "input_schema" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "output_schema" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_export_configs" ADD CONSTRAINT "project_export_configs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tool_usage_stats" ADD CONSTRAINT "tool_usage_stats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_export_configs_project" ON "project_export_configs" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tool_usage_stats_project_tool" ON "tool_usage_stats" USING btree ("project_id","tool_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_usage_stats_project" ON "tool_usage_stats" USING btree ("project_id");