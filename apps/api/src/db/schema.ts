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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .references(() => projects.id, { onDelete: "cascade" })
    .notNull(),
  keyHash: text("key_hash").unique().notNull(), // bcrypt hash of full key
  keyPrefix: text("key_prefix").notNull(), // e.g. "ag_live_xxxx" for display
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revoked: boolean("revoked").default(false).notNull(),
});

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
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 4 }),
  },
  (t) => [
    uniqueIndex("uq_tool_stats_slug_project_date").on(
      t.toolSlug,
      t.projectId,
      t.date,
    ),
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
  lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
});

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

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
