// Trace-driven swap recommendation + shadow-replay schemas (Tier 3.1 / 3.5).
//
// These power two related capabilities, both derived from the tools a project
// ACTUALLY calls (trace_steps.tool_name), not catalog search:
//   - tool-usage rollup  → per-tool observed stats
//   - swap recommendations → "you use X, consider Y" with current-vs-suggested deltas
//   - shadow replay       → offline projection of how a candidate would have done
import { z } from "zod";

// ---------------------------------------------------------------------------
// Tool usage rollup (Tier 3.1 input)
// ---------------------------------------------------------------------------

// One observed tool the project calls. `toolSlug` is the raw tool name from the
// SDK; it may or may not match a catalog tool slug.
export const ToolUsageRowSchema = z.object({
  toolSlug: z.string(),
  calls: z.number().int(),
  errorCount: z.number().int(),
  errorRate: z.number(), // 0–1
  avgLatencyMs: z.number().nullable(),
  p50LatencyMs: z.number().nullable(),
  p95LatencyMs: z.number().nullable(),
  totalCostUsd: z.number().nullable(),
  // Whether this observed tool name matches a tool in the catalog.
  inCatalog: z.boolean(),
});
export type ToolUsageRow = z.infer<typeof ToolUsageRowSchema>;

export const ToolUsageResponseSchema = z.object({
  projectId: z.string().uuid(),
  tools: z.array(ToolUsageRowSchema),
  computedAt: z.string().datetime(),
});
export type ToolUsageResponse = z.infer<typeof ToolUsageResponseSchema>;

// ---------------------------------------------------------------------------
// Swap recommendations (Tier 3.1 output)
// ---------------------------------------------------------------------------

// A signed delta (suggested − current). For metrics where lower is better
// (latency, cost, error rate) a negative delta is an improvement; `betterIsLower`
// records the direction so the UI can colour it correctly.
export const SwapDeltaSchema = z.object({
  current: z.number().nullable(),
  suggested: z.number().nullable(),
  delta: z.number().nullable(), // suggested - current; null when either side unknown
  betterIsLower: z.boolean(),
});
export type SwapDelta = z.infer<typeof SwapDeltaSchema>;

export const SwapRecommendationSchema = z.object({
  currentTool: z.string(),
  suggestedTool: z.string(), // catalog slug
  suggestedName: z.string(),
  category: z.string(),
  score: z.number(), // 0–100, overall attractiveness of the swap
  latency: SwapDeltaSchema, // p95 latency ms
  cost: SwapDeltaSchema, // per-call cost USD (current observed vs candidate — may be null)
  reliability: SwapDeltaSchema, // success rate 0–1 (betterIsLower=false)
  // 0–1 structural similarity of input/output JSON schemas; null when either
  // tool's schema is unknown (the common case for seeded catalog tools).
  schemaFit: z.number().nullable(),
  reason: z.string(),
});
export type SwapRecommendation = z.infer<typeof SwapRecommendationSchema>;

export const SwapRecommendationsResponseSchema = z.object({
  projectId: z.string().uuid(),
  recommendations: z.array(SwapRecommendationSchema),
  computedAt: z.string().datetime(),
});
export type SwapRecommendationsResponse = z.infer<
  typeof SwapRecommendationsResponseSchema
>;

// ---------------------------------------------------------------------------
// Shadow replay (Tier 3.5 — offline replay scoring, NO live routing)
// ---------------------------------------------------------------------------

export const ShadowReplayRequestSchema = z.object({
  currentTool: z.string().min(1),
  candidateSlug: z.string().min(1),
  windowDays: z.number().int().min(1).max(90).default(14),
});
export type ShadowReplayRequest = z.infer<typeof ShadowReplayRequestSchema>;

// Observed-vs-projected pair for a single metric.
export const ShadowMetricSchema = z.object({
  observed: z.number().nullable(),
  projected: z.number().nullable(),
  delta: z.number().nullable(), // projected - observed; null when either unknown
});
export type ShadowMetric = z.infer<typeof ShadowMetricSchema>;

export const ShadowReplayResponseSchema = z.object({
  projectId: z.string().uuid(),
  currentTool: z.string(),
  candidateSlug: z.string(),
  windowDays: z.number().int(),
  callsAnalyzed: z.number().int(),
  // Projections are ESTIMATES: candidate latency/error are taken from the
  // candidate's catalog/global benchmark stats applied to the observed call
  // volume. Cost cannot be projected (no per-tool cost benchmark exists), so
  // it is reported as null. See `notes`.
  p50LatencyMs: ShadowMetricSchema,
  p95LatencyMs: ShadowMetricSchema,
  errorRate: ShadowMetricSchema, // 0–1
  costUsd: ShadowMetricSchema, // observed total; projected always null
  // Net latency improvement at p95 (observed − projected, ms). Positive = faster.
  netLatencyImprovementMs: z.number().nullable(),
  notes: z.array(z.string()),
  computedAt: z.string().datetime(),
});
export type ShadowReplayResponse = z.infer<typeof ShadowReplayResponseSchema>;
