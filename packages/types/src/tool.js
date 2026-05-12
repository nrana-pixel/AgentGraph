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
export const PricingModelSchema = z.enum([
    "free",
    "freemium",
    "paid",
    "open_source",
]);
export const DataSourceSchema = z.enum(["seeded", "telemetry", "community"]);
export const DataResidencySchema = z.enum(["EU", "US", "APAC"]);
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
export const ToolGlobalStatsSchema = z.object({
    toolSlug: z.string(),
    totalCalls: z.number(),
    successRate: z.number().nullable(),
    avgLatencyMs: z.number().nullable(),
    p95LatencyMs: z.number().nullable(),
    popularityScore: z.number().nullable(),
    lastUpdated: z.string().datetime(),
});
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
export const RecommendResponseSchema = z.object({
    task: z.string(),
    recommendations: z.array(ToolRecommendationSchema),
    dataFreshness: z.string().datetime(),
});
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
});
//# sourceMappingURL=tool.js.map