ALTER TABLE "tool_stats" ALTER COLUMN "total_cost_usd" SET DATA TYPE numeric(16, 6);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trace_steps_timestamp" ON "trace_steps" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_traces_project_started" ON "traces" USING btree ("project_id","started_at");