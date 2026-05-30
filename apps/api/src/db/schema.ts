import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Users & Auth
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkId: text("clerk_id").unique().notNull(),
  email: text("email").unique().notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").unique().notNull(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => users.id),
  plan: text("plan").default("free").notNull(), // 'free' | 'pro' | 'team'
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  tracesUsedThisMonth: integer("traces_used_this_month").default(0).notNull(),
  // When true, this org's anonymised tool telemetry contributes to the
  // cross-project global benchmarks that power discovery/recommendations.
  // Opting out keeps the org's own per-project stats but excludes it from the
  // shared pool. See docs/DATA_GOVERNANCE.md.
  shareAnonymizedStats: boolean("share_anonymized_stats").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const orgMembers = pgTable(
  "org_members",
  {
    orgId: uuid("org_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: text("role").default("member").notNull(), // 'owner' | 'admin' | 'member'
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] })],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .references(() => organizations.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  slug: text("slug").unique().notNull(),
  costSpikeThresholdUsd: numeric("cost_spike_threshold_usd", {
    precision: 10,
    scale: 2,
  }).default("1.00"),
  // null means "no hard cap"; when set, ingest rejects once the current
  // month's running spend reaches this amount.
  monthlyCostCapUsd: numeric("monthly_cost_cap_usd", {
    precision: 10,
    scale: 2,
  }),
  // OTLP trace export — pipe persisted traces to a customer's collector
  // (Datadog/Honeycomb/own collector). Export runs out-of-band in the worker.
  otlpEndpoint: text("otlp_endpoint"), // full OTLP/HTTP traces endpoint, e.g. https://api.honeycomb.io/v1/traces
  otlpHeaders: text("otlp_headers"), // JSON string of { header: value } (e.g. auth tokens)
  otlpEnabled: boolean("otlp_enabled").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    keyHash: text("key_hash").unique().notNull(), // bcrypt hash of full key
    keyPrefix: text("key_prefix").notNull(), // e.g. "ag_live_xxxx" — used to scope the auth lookup
    name: text("name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revoked: boolean("revoked").default(false).notNull(),
  },
  // Auth narrows candidate keys by prefix before bcrypt-verifying, so this
  // lookup must be indexed — otherwise every request scans the whole table.
  (t) => [index("idx_api_keys_key_prefix").on(t.keyPrefix)],
);

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

export const traces = pgTable(
  "traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    agentId: text("agent_id").notNull(),
    sessionId: text("session_id"),
    userId: text("user_id"),
    env: text("env").default("prod").notNull(), // 'prod' | 'dev' | 'staging'
    status: text("status").default("running").notNull(), // 'running' | 'completed' | 'error'
    totalLatencyMs: integer("total_latency_ms"),
    totalTokens: integer("total_tokens"),
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 6 }),
    metadata: text("metadata").default("{}").notNull(), // JSON stored as text
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_traces_project_id").on(t.projectId),
    index("idx_traces_agent_id").on(t.agentId),
    index("idx_traces_session_id").on(t.sessionId),
    index("idx_traces_status").on(t.status),
    index("idx_traces_started_at").on(t.startedAt),
    // Trace list is scoped by project and ordered by started_at desc — a
    // composite serves the filter + sort in one index.
    index("idx_traces_project_started").on(t.projectId, t.startedAt),
  ],
);

export const traceSteps = pgTable(
  "trace_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: uuid("trace_id")
      .references(() => traces.id, { onDelete: "cascade" })
      .notNull(),
    stepIndex: integer("step_index").notNull(),
    // Parent step for span nesting. Currently always null (spans are flat);
    // present to enable future nested traces and OTLP parent-span linkage.
    parentStepId: uuid("parent_step_id"),
    type: text("type").notNull(), // 'llm_call' | 'tool_call' | 'retrieval' | 'human' | 'custom'
    name: text("name").notNull(),
    input: text("input"), // JSONB stored as text
    output: text("output"), // JSONB stored as text
    latencyMs: integer("latency_ms"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    totalTokens: integer("total_tokens"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    error: text("error"),
    model: text("model"),
    toolName: text("tool_name"),
    toolVersion: text("tool_version"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_trace_steps_trace_id").on(t.traceId),
    index("idx_trace_steps_tool_name").on(t.toolName),
    index("idx_trace_steps_type").on(t.type),
    // The nightly aggregator + lazy usage rollup filter trace_steps by a
    // timestamp range; without this they seq-scan the whole table.
    index("idx_trace_steps_timestamp").on(t.timestamp),
  ],
);

// ---------------------------------------------------------------------------
// Tool Intelligence Graph
// ---------------------------------------------------------------------------

export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique().notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(), // see ToolCategory enum
    website: text("website"),
    docsUrl: text("docs_url"),
    githubUrl: text("github_url"),
    isOpenSource: boolean("is_open_source").default(false).notNull(),
    isSelfHostable: boolean("is_self_hostable").default(false).notNull(),
    pricingModel: text("pricing_model"), // 'free' | 'freemium' | 'paid' | 'open_source'
    dataResidency: text("data_residency").array(), // ['EU', 'US', 'APAC']
    tags: text("tags").array(),
    dataSource: text("data_source").default("seeded").notNull(), // 'seeded' | 'telemetry' | 'community'
    sentimentScore: numeric("sentiment_score", { precision: 5, scale: 2 }),
    // JSON-schema strings describing the tool's input/output contract — used by
    // the swap-recommendation engine for "schema fit" scoring. Null = unknown.
    inputSchema: text("input_schema"),
    outputSchema: text("output_schema"),
    // Semantic embedding of name+description+tags, stored as a JSON float array
    // (portable across any Postgres — no pgvector extension required). Populated
    // by catalog sync / backfill; null when embeddings are unconfigured, in
    // which case discovery falls back to keyword/FTS relevance.
    embedding: text("embedding"),
    // sha256(name + description + JSON.stringify(inputSchema)) — fingerprints the
    // tool's contract. A changed hash means the tool's definition mutated
    // (rug-pull detection, spec 02; quality re-score trigger, spec 03).
    definitionHash: text("definition_hash"),
    // Description/schema quality score 0–100 (spec 03). null = not yet scored.
    descriptionQualityScore: integer("description_quality_score"),
    qualityIssues: text("quality_issues"), // JSON string[] of issue codes
    qualityCheckedAt: timestamp("quality_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // GIN index for fast full-text search used by the recommendation engine
    index("idx_tools_fts").using(
      "gin",
      sql`to_tsvector('english', coalesce(${t.name}, '') || ' ' || coalesce(${t.description}, '') || ' ' || coalesce(immutable_array_to_string(${t.tags}, ' '), ''))`,
    ),
    index("idx_tools_category").on(t.category),
    index("idx_tools_data_source").on(t.dataSource),
  ],
);

export const toolStats = pgTable(
  "tool_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolSlug: text("tool_slug")
      .references(() => tools.slug, { onDelete: "cascade" })
      .notNull(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    date: date("date").notNull(),
    callCount: integer("call_count").default(0).notNull(),
    successCount: integer("success_count").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    avgLatencyMs: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
    p95LatencyMs: numeric("p95_latency_ms", { precision: 10, scale: 2 }),
    // Wide enough to hold a high-volume tool's daily rolled-up spend without
    // overflowing (precision 10/scale 4 capped at ~$1M/tool/day/project).
    totalCostUsd: numeric("total_cost_usd", { precision: 16, scale: 6 }),
  },
  (t) => [
    uniqueIndex("uq_tool_stats_slug_project_date").on(t.toolSlug, t.projectId, t.date),
    index("idx_tool_stats_tool_slug").on(t.toolSlug),
    index("idx_tool_stats_project").on(t.projectId),
    index("idx_tool_stats_date").on(t.date),
  ],
);

export const toolGlobalStats = pgTable("tool_global_stats", {
  toolSlug: text("tool_slug")
    .primaryKey()
    .references(() => tools.slug, { onDelete: "cascade" }),
  totalCalls: bigint("total_calls", { mode: "number" }).default(0).notNull(),
  successRate: numeric("success_rate", { precision: 5, scale: 4 }), // 0.0000–1.0000
  avgLatencyMs: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
  p95LatencyMs: numeric("p95_latency_ms", { precision: 10, scale: 2 }),
  popularityScore: numeric("popularity_score", { precision: 5, scale: 2 }), // 0–100
  // Reliability Score 0–100 (spec 01). null when distinctOrgs < K (min-k gate)
  // or no telemetry yet — never published below the anonymity threshold.
  reliabilityScore: numeric("reliability_score", { precision: 5, scale: 2 }),
  costPerCallUsd: numeric("cost_per_call_usd", { precision: 12, scale: 6 }),
  // JSON: { timeout, auth, rate_limit, schema, "5xx", other }
  errorTaxonomy: text("error_taxonomy"),
  // Count of distinct sharing orgs contributing to this tool's pooled stats.
  // Drives min-k anonymity (K=3) — scores are withheld below the threshold.
  distinctOrgs: integer("distinct_orgs").default(0).notNull(),
  gradeBand: text("grade_band"), // 'A'|'B'|'C'|'D'|'F'
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

// Daily snapshot of tool_global_stats — the time series the regression
// "downdetector" (spec 02) diffs against to detect cross-network degradation.
export const toolGlobalStatsHistory = pgTable(
  "tool_global_stats_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toolSlug: text("tool_slug").notNull(),
    date: date("date").notNull(),
    successRate: numeric("success_rate", { precision: 5, scale: 4 }),
    p95LatencyMs: numeric("p95_latency_ms", { precision: 10, scale: 2 }),
    costPerCallUsd: numeric("cost_per_call_usd", { precision: 12, scale: 6 }),
    totalCalls: bigint("total_calls", { mode: "number" }),
    distinctOrgs: integer("distinct_orgs").default(0).notNull(),
  },
  (t) => [
    uniqueIndex("uq_tool_global_stats_history_slug_date").on(t.toolSlug, t.date),
    index("idx_tool_global_stats_history_slug_date").on(t.toolSlug, t.date),
  ],
);

// Per-project rollup of how an agent ACTUALLY uses each tool (derived from
// trace_steps.tool_name). Feeds trace-driven swap recommendations. toolSlug is
// not FK'd — observed tool names may not be in the catalog.
export const toolUsageStats = pgTable(
  "tool_usage_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    toolSlug: text("tool_slug").notNull(),
    calls: integer("calls").default(0).notNull(),
    errorCount: integer("error_count").default(0).notNull(),
    avgLatencyMs: numeric("avg_latency_ms", { precision: 10, scale: 2 }),
    p50LatencyMs: numeric("p50_latency_ms", { precision: 10, scale: 2 }),
    p95LatencyMs: numeric("p95_latency_ms", { precision: 10, scale: 2 }),
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 6 }),
    lastComputedAt: timestamp("last_computed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_tool_usage_stats_project_tool").on(t.projectId, t.toolSlug),
    index("idx_tool_usage_stats_project").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  events: text("events").array().notNull(), // ['cost_spike', 'error_rate_threshold', 'trace_completed']
  secret: text("secret").notNull(), // HMAC signing secret
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// Warehouse / object-store export
// ---------------------------------------------------------------------------

// Per-project destination for scheduled trace export. `config` holds NON-secret
// routing only (bucket, region, prefix, dataset, table); credentials come from
// the worker's environment, never the DB. highWaterMark is the export cursor.
export const projectExportConfigs = pgTable(
  "project_export_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .references(() => projects.id, { onDelete: "cascade" })
      .notNull(),
    destination: text("destination").notNull(), // 's3' | 'gcs' | 'bigquery' | 'snowflake'
    config: text("config").default("{}").notNull(), // JSON string, non-secret routing
    format: text("format").default("ndjson").notNull(), // 'ndjson' | 'parquet'
    enabled: boolean("enabled").default(false).notNull(),
    highWaterMark: timestamp("high_water_mark", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_project_export_configs_project").on(t.projectId)],
);

// ---------------------------------------------------------------------------
// Type exports for use in services
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;

export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;

export type TraceStep = typeof traceSteps.$inferSelect;
export type NewTraceStep = typeof traceSteps.$inferInsert;

export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;

export type ToolStat = typeof toolStats.$inferSelect;
export type NewToolStat = typeof toolStats.$inferInsert;

export type ToolGlobalStat = typeof toolGlobalStats.$inferSelect;
export type NewToolGlobalStat = typeof toolGlobalStats.$inferInsert;

export type ToolGlobalStatsHistory = typeof toolGlobalStatsHistory.$inferSelect;
export type NewToolGlobalStatsHistory = typeof toolGlobalStatsHistory.$inferInsert;

export type ToolUsageStat = typeof toolUsageStats.$inferSelect;
export type NewToolUsageStat = typeof toolUsageStats.$inferInsert;

export type ProjectExportConfig = typeof projectExportConfigs.$inferSelect;
export type NewProjectExportConfig = typeof projectExportConfigs.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
