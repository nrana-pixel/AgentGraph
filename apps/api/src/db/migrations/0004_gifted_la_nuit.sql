ALTER TABLE "projects" ADD COLUMN "otlp_endpoint" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "otlp_headers" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "otlp_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "trace_steps" ADD COLUMN "parent_step_id" uuid;