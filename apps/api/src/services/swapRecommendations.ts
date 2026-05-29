import { eq, inArray, and, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { tools, toolGlobalStats } from "../db/schema.js";
import { getToolUsage } from "./toolUsageRollup.js";
import type {
  SwapDelta,
  SwapRecommendation,
  SwapRecommendationsResponse,
  ToolUsageRow,
} from "@agentgraph/types";

const MAX_SUGGESTIONS_PER_TOOL = 3;

// Catalog tool + its global benchmark stats, joined.
interface CatalogTool {
  slug: string;
  name: string;
  category: string;
  inputSchema: string | null;
  outputSchema: string | null;
  successRate: number | null;
  p95LatencyMs: number | null;
  popularityScore: number | null;
}

// ---------------------------------------------------------------------------
// Pure scoring / schema-fit helpers (unit-tested without a DB)
// ---------------------------------------------------------------------------

/**
 * Structural similarity of two JSON-schema strings, 0–1.
 *
 * Heuristic: parse both, look at top-level `properties` (or the root object's
 * own keys when there is no `properties`), and compute the fraction of shared
 * keys that ALSO share the same declared `type`. This is a coarse "will my
 * existing call sites mostly line up" signal, not a validator.
 *
 * Returns null (unknown / neutral) when either schema is absent or unparseable —
 * so callers weight schema fit at 0 rather than penalising the candidate.
 */
export function computeSchemaFit(
  currentSchema: string | null,
  candidateSchema: string | null,
): number | null {
  if (!currentSchema || !candidateSchema) return null;

  const a = safeParseSchemaKeys(currentSchema);
  const b = safeParseSchemaKeys(candidateSchema);
  if (a === null || b === null) return null;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length === 0 && bKeys.length === 0) return 1;
  if (aKeys.length === 0 || bKeys.length === 0) return 0;

  const union = new Set([...aKeys, ...bKeys]);
  let matched = 0;
  for (const key of aKeys) {
    if (key in b) {
      // Shared key counts as 1; full credit only when types also agree.
      matched += a[key] === b[key] ? 1 : 0.5;
    }
  }
  return matched / union.size;
}

// Extract a { key: type } map from a JSON-schema string. Returns null on parse
// failure. Looks at `properties` first, falling back to the object's own keys.
function safeParseSchemaKeys(raw: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const props =
    obj["properties"] && typeof obj["properties"] === "object"
      ? (obj["properties"] as Record<string, unknown>)
      : obj;

  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(props)) {
    if (val && typeof val === "object" && "type" in (val as object)) {
      const t = (val as { type?: unknown }).type;
      out[key] = typeof t === "string" ? t : "unknown";
    } else {
      out[key] = typeof val;
    }
  }
  return out;
}

interface SwapScoreInput {
  // Observed current values
  currentP95: number | null;
  currentErrorRate: number; // 0–1
  // Candidate benchmark values
  candidateP95: number | null;
  candidateSuccessRate: number | null; // 0–1
  candidatePopularity: number | null; // 0–100
  schemaFit: number | null; // 0–1 or null (unknown)
}

/**
 * Overall attractiveness of a swap, 0–100. Mirrors the catalog recommendation
 * engine's weighting spirit (reliability-heavy) but framed as IMPROVEMENT over
 * the tool the project already uses.
 *
 * Components (each 0–100):
 *   reliability  — candidate success rate vs current (improvement-weighted)
 *   latency      — candidate p95 vs current p95 (improvement-weighted)
 *   popularity   — candidate global popularity (validation signal)
 *   schemaFit    — structural drop-in similarity; SKIPPED (weight redistributed)
 *                  when unknown so an absent schema neither helps nor hurts.
 */
export function scoreSwap(input: SwapScoreInput): number {
  const currentSuccess = 1 - input.currentErrorRate;
  const candidateSuccess = input.candidateSuccessRate ?? currentSuccess;
  // 50 = parity; >50 candidate is more reliable. Each point of success-rate
  // delta moves the sub-score by 1 (×100 → scaled into 0–100 around 50).
  const reliabilityScore = clamp(
    50 + (candidateSuccess - currentSuccess) * 100,
    0,
    100,
  );

  const curP95 = input.currentP95;
  const candP95 = input.candidateP95;
  let latencyScore = 50; // parity default when either side is unknown
  if (curP95 !== null && candP95 !== null && curP95 > 0) {
    // ratio < 1 means candidate is faster. Map ratio 0→100, 1→50, 2→0.
    const ratio = candP95 / curP95;
    latencyScore = clamp(100 - ratio * 50, 0, 100);
  }

  const popularityScore = input.candidatePopularity ?? 50;

  // Base weights; schemaFit is redistributed to the others when unknown.
  const wReliability = 0.45;
  const wLatency = 0.3;
  const wPopularity = 0.15;
  const wSchema = 0.1;

  if (input.schemaFit === null) {
    const scale = 1 / (wReliability + wLatency + wPopularity);
    return round1(
      (reliabilityScore * wReliability +
        latencyScore * wLatency +
        popularityScore * wPopularity) *
        scale,
    );
  }

  const schemaScore = input.schemaFit * 100;
  return round1(
    reliabilityScore * wReliability +
      latencyScore * wLatency +
      popularityScore * wPopularity +
      schemaScore * wSchema,
  );
}

// The current (in-use) tool's catalog schemas, when it is itself a catalog tool.
// Null/absent when the in-use tool isn't catalogued or has no declared schema.
export interface CurrentSchemas {
  inputSchema: string | null;
  outputSchema: string | null;
}

/**
 * Average input-fit and output-fit (each 0–1), comparing the CURRENT tool's
 * contract to the CANDIDATE's. Returns whichever sub-fit is available; null
 * when neither input nor output can be compared (e.g. current tool's schemas
 * are unknown — the common case for observed-but-uncatalogued tools).
 */
export function schemaFitBetween(
  current: CurrentSchemas,
  candidate: CatalogTool,
): number | null {
  const inputFit = computeSchemaFit(current.inputSchema, candidate.inputSchema);
  const outputFit = computeSchemaFit(current.outputSchema, candidate.outputSchema);
  const parts = [inputFit, outputFit].filter((v): v is number => v !== null);
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// Pure: build a current-vs-suggested swap object from observed usage + candidate.
// `current` carries the in-use tool's catalog schemas (when known) so schema fit
// is a genuine current-vs-candidate comparison.
export function buildSwap(
  usage: ToolUsageRow,
  candidate: CatalogTool,
  current: CurrentSchemas = { inputSchema: null, outputSchema: null },
): SwapRecommendation {
  const currentSuccess = 1 - usage.errorRate;
  const schemaFit = schemaFitBetween(current, candidate);

  const score = scoreSwap({
    currentP95: usage.p95LatencyMs,
    currentErrorRate: usage.errorRate,
    candidateP95: candidate.p95LatencyMs,
    candidateSuccessRate: candidate.successRate,
    candidatePopularity: candidate.popularityScore,
    schemaFit,
  });

  const latency: SwapDelta = makeDelta(
    usage.p95LatencyMs,
    candidate.p95LatencyMs,
    true,
  );
  // No per-tool cost benchmark exists in the catalog, so suggested cost is
  // unknown. We surface the observed per-call cost for context only.
  const currentPerCall =
    usage.totalCostUsd !== null && usage.calls > 0
      ? usage.totalCostUsd / usage.calls
      : null;
  const cost: SwapDelta = makeDelta(currentPerCall, null, true);
  const reliability: SwapDelta = makeDelta(
    currentSuccess,
    candidate.successRate,
    false,
  );

  return {
    currentTool: usage.toolSlug,
    suggestedTool: candidate.slug,
    suggestedName: candidate.name,
    category: candidate.category,
    score,
    latency,
    cost,
    reliability,
    schemaFit,
    reason: buildReason(usage, candidate, latency, reliability),
  };
}

function buildReason(
  usage: ToolUsageRow,
  candidate: CatalogTool,
  latency: SwapDelta,
  reliability: SwapDelta,
): string {
  const parts: string[] = [];
  if (
    reliability.delta !== null &&
    reliability.delta > 0.01 &&
    candidate.successRate !== null
  ) {
    parts.push(
      `higher success rate (${(candidate.successRate * 100).toFixed(1)}% vs your ${((1 - usage.errorRate) * 100).toFixed(1)}%)`,
    );
  }
  if (latency.delta !== null && latency.delta < 0) {
    parts.push(`lower p95 latency (${Math.abs(Math.round(latency.delta))}ms faster)`);
  }
  if (candidate.popularityScore !== null && candidate.popularityScore >= 80) {
    parts.push("widely adopted across the catalog");
  }
  if (parts.length === 0) {
    return `Same-category alternative to ${usage.toolSlug}.`;
  }
  return `Consider ${candidate.name}: ` + parts.join(", ") + ".";
}

// ---------------------------------------------------------------------------
// DB-backed entrypoint
// ---------------------------------------------------------------------------

export async function getSwapRecommendations(
  projectId: string,
): Promise<SwapRecommendationsResponse> {
  const usage = await getToolUsage(projectId);

  // Only tools that match a catalog entry can have same-category alternatives.
  const usedSlugs = usage.tools.filter((t) => t.inCatalog).map((t) => t.toolSlug);

  if (usedSlugs.length === 0) {
    return { projectId, recommendations: [], computedAt: usage.computedAt };
  }

  // Resolve the catalog category + schemas for each used tool. The schemas feed
  // the current-vs-candidate schema-fit comparison.
  const usedCatalog = await db
    .select({
      slug: tools.slug,
      category: tools.category,
      inputSchema: tools.inputSchema,
      outputSchema: tools.outputSchema,
    })
    .from(tools)
    .where(inArray(tools.slug, usedSlugs));
  const categoryBySlug = new Map(usedCatalog.map((t) => [t.slug, t.category]));
  const schemasBySlug = new Map<string, CurrentSchemas>(
    usedCatalog.map((t) => [
      t.slug,
      { inputSchema: t.inputSchema, outputSchema: t.outputSchema },
    ]),
  );
  const categories = [...new Set(usedCatalog.map((t) => t.category))];

  // Fetch all candidate tools in those categories (excluding the used tools
  // themselves), joined to their global benchmark stats.
  const candidates = await db
    .select({
      slug: tools.slug,
      name: tools.name,
      category: tools.category,
      inputSchema: tools.inputSchema,
      outputSchema: tools.outputSchema,
      successRate: toolGlobalStats.successRate,
      p95LatencyMs: toolGlobalStats.p95LatencyMs,
      popularityScore: toolGlobalStats.popularityScore,
    })
    .from(tools)
    .leftJoin(toolGlobalStats, eq(tools.slug, toolGlobalStats.toolSlug))
    .where(
      and(
        inArray(tools.category, categories.length > 0 ? categories : [""]),
        ne(tools.slug, ""),
      ),
    );

  const candidatesByCategory = new Map<string, CatalogTool[]>();
  for (const c of candidates) {
    const ct: CatalogTool = {
      slug: c.slug,
      name: c.name,
      category: c.category,
      inputSchema: c.inputSchema,
      outputSchema: c.outputSchema,
      successRate: c.successRate !== null ? Number(c.successRate) : null,
      p95LatencyMs: c.p95LatencyMs !== null ? Number(c.p95LatencyMs) : null,
      popularityScore:
        c.popularityScore !== null ? Number(c.popularityScore) : null,
    };
    const list = candidatesByCategory.get(c.category) ?? [];
    list.push(ct);
    candidatesByCategory.set(c.category, list);
  }

  const recommendations: SwapRecommendation[] = [];
  for (const used of usage.tools) {
    if (!used.inCatalog) continue;
    const category = categoryBySlug.get(used.toolSlug);
    if (!category) continue;
    const pool = (candidatesByCategory.get(category) ?? []).filter(
      (c) => c.slug !== used.toolSlug,
    );

    const currentSchemas = schemasBySlug.get(used.toolSlug) ?? {
      inputSchema: null,
      outputSchema: null,
    };
    const swaps = pool
      .map((c) => buildSwap(used, c, currentSchemas))
      // Only surface swaps that look like an improvement (>50 = better-than-parity).
      .filter((s) => s.score > 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS_PER_TOOL);

    recommendations.push(...swaps);
  }

  recommendations.sort((a, b) => b.score - a.score);

  return { projectId, recommendations, computedAt: usage.computedAt };
}

// ---------------------------------------------------------------------------
// small pure utils
// ---------------------------------------------------------------------------

function makeDelta(
  current: number | null,
  suggested: number | null,
  betterIsLower: boolean,
): SwapDelta {
  const delta =
    current !== null && suggested !== null ? suggested - current : null;
  return { current, suggested, delta, betterIsLower };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export type { CatalogTool, SwapScoreInput };
