CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"last_used_at" timestamp with time zone,
	"revoked" boolean DEFAULT false NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_members" (
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "org_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"traces_used_this_month" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "organizations_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_global_stats" (
	"tool_slug" text PRIMARY KEY NOT NULL,
	"total_calls" bigint DEFAULT 0 NOT NULL,
	"success_rate" numeric(5, 4),
	"avg_latency_ms" numeric(10, 2),
	"p95_latency_ms" numeric(10, 2),
	"popularity_score" numeric(5, 2),
	"last_updated" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tool_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool_slug" text NOT NULL,
	"project_id" uuid NOT NULL,
	"date" date NOT NULL,
	"call_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"avg_latency_ms" numeric(10, 2),
	"p95_latency_ms" numeric(10, 2),
	"total_cost_usd" numeric(10, 4)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"website" text,
	"docs_url" text,
	"github_url" text,
	"is_open_source" boolean DEFAULT false NOT NULL,
	"is_self_hostable" boolean DEFAULT false NOT NULL,
	"pricing_model" text,
	"data_residency" text[],
	"tags" text[],
	"data_source" text DEFAULT 'seeded' NOT NULL,
	"sentiment_score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tools_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trace_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" uuid NOT NULL,
	"step_index" integer NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"input" text,
	"output" text,
	"latency_ms" integer,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"cost_usd" numeric(10, 6),
	"error" text,
	"model" text,
	"tool_name" text,
	"tool_version" text,
	"timestamp" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"env" text DEFAULT 'prod' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"total_latency_ms" integer,
	"total_tokens" integer,
	"total_cost_usd" numeric(10, 6),
	"metadata" text DEFAULT '{}' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now(),
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"events" text[] NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tool_global_stats" ADD CONSTRAINT "tool_global_stats_tool_slug_tools_slug_fk" FOREIGN KEY ("tool_slug") REFERENCES "public"."tools"("slug") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tool_stats" ADD CONSTRAINT "tool_stats_tool_slug_tools_slug_fk" FOREIGN KEY ("tool_slug") REFERENCES "public"."tools"("slug") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tool_stats" ADD CONSTRAINT "tool_stats_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trace_steps" ADD CONSTRAINT "trace_steps_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_array_to_string(text[], text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$ SELECT array_to_string($1, $2) $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_tool_stats_slug_project_date" ON "tool_stats" USING btree ("tool_slug","project_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_stats_tool_slug" ON "tool_stats" USING btree ("tool_slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_stats_project" ON "tool_stats" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tool_stats_date" ON "tool_stats" USING btree ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tools_fts" ON "tools" USING gin (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", '') || ' ' || coalesce(immutable_array_to_string("tags", ' '), '')));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tools_category" ON "tools" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tools_data_source" ON "tools" USING btree ("data_source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trace_steps_trace_id" ON "trace_steps" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trace_steps_tool_name" ON "trace_steps" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_trace_steps_type" ON "trace_steps" USING btree ("type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_traces_project_id" ON "traces" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_traces_agent_id" ON "traces" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_traces_session_id" ON "traces" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_traces_status" ON "traces" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_traces_started_at" ON "traces" USING btree ("started_at");
