import { z } from "zod";

export const ToolCategorySchema = z.enum([
  "auth",
  "email",
  "analytics",
  "queue",
  "database",
  "vector_db",
  "crm",
  "payments",
  "storage",
  "search",
  "monitoring",
  "communication",
  "ai_gateway",
  "llm_provider",
  "other",
]);
export type ToolCategory = z.infer<typeof ToolCategorySchema>;

export const PricingModelSchema = z.enum([
  "free",
  "freemium",
  "paid",
  "open_source",
]);
export type PricingModel = z.infer<typeof PricingModelSchema>;

export const DataSourceSchema = z.enum(["seeded", "telemetry", "community"]);
export type DataSource = z.infer<typeof DataSourceSchema>;

export const DataResidencySchema = z.enum(["EU", "US", "APAC"]);
export type DataResidency = z.infer<typeof DataResidencySchema>;

export const ToolSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: ToolCategorySchema,
  website: z.string().url().nullable(),
  docsUrl: z.string().url().nullable(),
  githubUrl: z.string().url().nullable(),
  isOpenSource: z.boolean(),
  isSelfHostable: z.boolean(),
  pricingModel: PricingModelSchema.nullable(),
  dataResidency: z.array(DataResidencySchema),
  tags: z.array(z.string()),
  dataSource: DataSourceSchema,
  sentimentScore: z.number().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Tool = z.infer<typeof ToolSchema>;

export const ToolGlobalStatsSchema = z.object({
  toolSlug: z.string(),
  totalCalls: z.number(),
  successRate: z.number().nullable(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  popularityScore: z.number().nullable(),
  lastUpdated: z.string().datetime(),
});
export type ToolGlobalStats = z.infer<typeof ToolGlobalStatsSchema>;

export const GradeBandSchema = z.enum(["A", "B", "C", "D", "F"]);
export type GradeBand = z.infer<typeof GradeBandSchema>;

// Error-bucket counts surfaced by the reliability API (spec 01).
export const ErrorTaxonomySchema = z.object({
  timeout: z.number(),
  auth: z.number(),
  rate_limit: z.number(),
  schema: z.number(),
  "5xx": z.number(),
  other: z.number(),
});
export type ErrorTaxonomy = z.infer<typeof ErrorTaxonomySchema>;

// GET /v1/tools/:slug/reliability response (spec 01). reliabilityScore/gradeBand
// are null below the min-k anonymity threshold (status = "insufficient_data").
export const ToolReliabilityResponseSchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  reliabilityScore: z.number().nullable(),
  gradeBand: GradeBandSchema.nullable(),
  successRate: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  costPerCallUsd: z.number().nullable(),
  errorTaxonomy: ErrorTaxonomySchema,
  distinctOrgs: z.number(),
  totalCalls: z.number(),
  dataSource: z.string(),
  status: z.enum(["ok", "insufficient_data"]),
  lastUpdated: z.string().datetime().nullable(),
});
export type ToolReliabilityResponse = z.infer<
  typeof ToolReliabilityResponseSchema
>;

export const RecommendQuerySchema = z.object({
  task: z.string().min(1).max(200),
  category: ToolCategorySchema.optional(),
  selfHosted: z
    .string()
    .transform((v) => v === "true")
    .pipe(z.boolean())
    .optional(),
  openSource: z
    .string()
    .transform((v) => v === "true")
    .pipe(z.boolean())
    .optional(),
  dataResidency: DataResidencySchema.optional(),
  maxCost: PricingModelSchema.optional(),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(10))
    .default("5"),
});
export type RecommendQuery = z.infer<typeof RecommendQuerySchema>;

export const ToolRecommendationSchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: ToolCategorySchema,
  score: z.number(),
  successRate: z.number().nullable(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  popularityScore: z.number().nullable(),
  sentimentScore: z.number().nullable(),
  isOpenSource: z.boolean(),
  isSelfHostable: z.boolean(),
  pricingModel: PricingModelSchema.nullable(),
  dataResidency: z.array(DataResidencySchema),
  reason: z.string(),
  dataSource: DataSourceSchema,
  website: z.string().nullable(),
  docsUrl: z.string().nullable(),
});
export type ToolRecommendation = z.infer<typeof ToolRecommendationSchema>;

export const RecommendResponseSchema = z.object({
  task: z.string(),
  recommendations: z.array(ToolRecommendationSchema),
  dataFreshness: z.string().datetime(),
});
export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;

// ---------------------------------------------------------------------------
// Runtime discovery — POST /v1/discover
// ---------------------------------------------------------------------------
//
// Unlike /recommend (a GET that ranks the WHOLE catalog from query-string
// params), discover is a POST an agent calls at inference time. It ranks tools
// for a specific task — optionally restricted to the tools the agent can
// actually call (`availableTools`) — and returns their input/output schemas so
// the agent never has to load every tool definition into its context.
export const DiscoverQuerySchema = z.object({
  task: z.string().min(1).max(500),
  // Slugs the calling agent can actually invoke. When present, ranking is
  // restricted to this set (rank-within-toolset). When absent, the whole
  // catalog is searched.
  availableTools: z.array(z.string()).max(2000).optional(),
  // Free-form extra context (surrounding conversation, goal). Folded into the
  // task-relevance signal when present.
  context: z.string().max(2000).optional(),
  // JSON-schema string of the input the agent already has on hand. Enables
  // schema-fit scoring; when absent that weight is redistributed.
  currentInputSchema: z.string().max(20_000).optional(),
  category: ToolCategorySchema.optional(),
  selfHosted: z.boolean().optional(),
  openSource: z.boolean().optional(),
  dataResidency: DataResidencySchema.optional(),
  maxCost: PricingModelSchema.optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type DiscoverQuery = z.infer<typeof DiscoverQuerySchema>;

export const DiscoveredToolSchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: ToolCategorySchema,
  score: z.number(),
  // Component sub-scores (0–100), surfaced so callers can see WHY a tool ranked.
  scores: z.object({
    taskRelevance: z.number(),
    schemaFit: z.number().nullable(),
    reliability: z.number(),
    orgHistory: z.number().nullable(),
    latency: z.number(),
  }),
  reason: z.string(),
  // The tool's declared contract — the whole point of discovery: hand the agent
  // the schema so it can call the tool without loading the full registry.
  inputSchema: z.string().nullable(),
  outputSchema: z.string().nullable(),
  successRate: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  popularityScore: z.number().nullable(),
  sentimentScore: z.number().nullable(),
  isOpenSource: z.boolean(),
  isSelfHostable: z.boolean(),
  pricingModel: PricingModelSchema.nullable(),
  dataResidency: z.array(DataResidencySchema),
  dataSource: DataSourceSchema,
  website: z.string().nullable(),
  docsUrl: z.string().nullable(),
  // True when this tool was in the caller's `availableTools` set.
  availableToCaller: z.boolean(),
  // Tool-intrinsic reliability (spec 01) + description quality (spec 03) —
  // surfaced so discovery can down-rank unreliable / poorly-described tools.
  reliabilityScore: z.number().nullable().optional(),
  gradeBand: GradeBandSchema.nullable().optional(),
  descriptionQualityScore: z.number().nullable().optional(),
  qualityIssues: z.array(z.string()).nullable().optional(),
});
export type DiscoveredTool = z.infer<typeof DiscoveredToolSchema>;

export const DiscoverResponseSchema = z.object({
  task: z.string(),
  tools: z.array(DiscoveredToolSchema),
  dataFreshness: z.string().datetime(),
});
export type DiscoverResponse = z.infer<typeof DiscoverResponseSchema>;

// ---------------------------------------------------------------------------
// Tool-search reranker — POST /v1/rerank (spec 04)
// ---------------------------------------------------------------------------
//
// Mode A: an upstream retriever (Anthropic Tool Search, a vector index, …) has
// already selected candidate tools by name/description match. We rerank them by
// real-world reliability before the agent sees them — biased toward intrinsic
// signals since retrieval relevance was decided upstream. Reuses DiscoveredTool
// as the response item shape.
export const RerankCandidateSchema = z.union([
  z.object({ slug: z.string().min(1) }),
  z.object({ name: z.string().min(1), description: z.string().optional() }),
]);
export type RerankCandidate = z.infer<typeof RerankCandidateSchema>;

export const RerankQuerySchema = z.object({
  task: z.string().min(1).max(500),
  // The candidate tools to rerank. Resolved against the catalog by slug, with a
  // fallback exact-name match. Unknown candidates are kept (ranked last).
  candidates: z.array(RerankCandidateSchema).min(1).max(2000),
  // Optional: slugs the calling agent can actually invoke (sets availableToCaller).
  availableTools: z.array(z.string()).max(2000).optional(),
  limit: z.number().int().min(1).max(2000).optional(),
});
export type RerankQuery = z.infer<typeof RerankQuerySchema>;

export const RerankResponseSchema = z.object({
  task: z.string(),
  ranked: z.array(DiscoveredToolSchema),
});
export type RerankResponse = z.infer<typeof RerankResponseSchema>;

export const ToolListItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  website: z.string().nullable(),
  docsUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  isOpenSource: z.boolean(),
  isSelfHostable: z.boolean(),
  pricingModel: z.string().nullable(),
  dataResidency: z.array(z.string()).nullable(),
  tags: z.array(z.string()).nullable(),
  dataSource: z.string(),
  sentimentScore: z.string().nullable(),
  successRate: z.string().nullable(),
  avgLatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  totalCalls: z.number().nullable(),
  popularityScore: z.string().nullable(),
  reliabilityScore: z.string().nullable(),
  gradeBand: GradeBandSchema.nullable(),
  descriptionQualityScore: z.number().nullable(),
  qualityIssues: z.array(z.string()).nullable(),
});
export type ToolListItem = z.infer<typeof ToolListItemSchema>;

// GET /v1/tools/:slug/health response (spec 02 — the "Downdetector" surface).
// status reflects whether the tool is currently regressing across the network;
// sparkline is the trailing 30-day daily history from tool_global_stats_history.
export const ToolHealthPointSchema = z.object({
  date: z.string(),
  successRate: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  costPerCallUsd: z.number().nullable(),
  totalCalls: z.number().nullable(),
});
export type ToolHealthPoint = z.infer<typeof ToolHealthPointSchema>;

export const ToolHealthRegressionSchema = z.object({
  kind: z.enum(["success_rate", "latency", "cost", "rug_pull"]),
  current: z.object({
    successRate: z.number().nullable(),
    p95LatencyMs: z.number().nullable(),
    costPerCallUsd: z.number().nullable(),
  }),
  baseline: z.object({
    successRate: z.number().nullable(),
    p95LatencyMs: z.number().nullable(),
    costPerCallUsd: z.number().nullable(),
  }),
});
export type ToolHealthRegression = z.infer<typeof ToolHealthRegressionSchema>;

export const ToolHealthResponseSchema = z.object({
  slug: z.string(),
  name: z.string(),
  status: z.enum(["healthy", "degraded", "regressed"]),
  lastRegression: ToolHealthRegressionSchema.nullable(),
  sparkline: z.array(ToolHealthPointSchema),
});
export type ToolHealthResponse = z.infer<typeof ToolHealthResponseSchema>;
