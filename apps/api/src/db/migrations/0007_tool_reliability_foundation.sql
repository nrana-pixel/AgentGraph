CREATE TABLE IF NOT EXISTS "tool_global_stats_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_slug" text NOT NULL,
	"date" date NOT NULL,
	"success_rate" numeric(5, 4),
	"p95_latency_ms" numeric(10, 2),
	"cost_per_call_usd" numeric(12, 6),
	"total_calls" bigint,
	"distinct_orgs" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_global_stats" ADD COLUMN "reliability_score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "tool_global_stats" ADD COLUMN "cost_per_call_usd" numeric(12, 6);--> statement-breakpoint
ALTER TABLE "tool_global_stats" ADD COLUMN "error_taxonomy" text;--> statement-breakpoint
ALTER TABLE "tool_global_stats" ADD COLUMN "distinct_orgs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_global_stats" ADD COLUMN "grade_band" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "definition_hash" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "description_quality_score" integer;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "quality_issues" text;--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "quality_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tool_global_stats_history_slug_date" ON "tool_global_stats_history" USING btree ("tool_slug","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_global_stats_history_slug_date" ON "tool_global_stats_history" USING btree ("tool_slug","date");