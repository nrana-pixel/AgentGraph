import { createHash } from "node:crypto";
import { sql, and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { tools, toolGlobalStats, toolUsageStats } from "../db/schema.js";
import { redis } from "../db/redis.js";
import { computeSchemaFit } from "./swapRecommendations.js";
import { toolBaseColumns, toolGlobalStatColumns, toolFtsMatch } from "./toolQueryShared.js";
import {
  embedText,
  embeddingsEnabled,
  cosineSimilarity,
  parseStoredEmbedding,
} from "../lib/embeddings.js";
import type {
  DiscoverQuery,
  DiscoverResponse,
  DiscoveredTool,
  GradeBand,
  RerankQuery,
  RerankResponse,
} from "@agentgraph/types";

const COLD_START_THRESHOLD = 50;
const COLD_START_SCORE_CAP = 70;
// An org needs at least this many of its own calls before its private history
// is trusted as a ranking signal (below this it's noise).
const ORG_HISTORY_MIN_CALLS = 5;

interface CandidateRow {
  slug: string;
  name: string;
  description: string | null;
  category: string;
  website: string | null;
  docsUrl: string | null;
  isOpenSource: boolean;
  isSelfHostable: boolean;
  pricingModel: string | null;
  dataResidency: string[] | null;
  tags: string[] | null;
  dataSource: string;
  sentimentScore: string | null;
  inputSchema: string | null;
  outputSchema: string | null;
  embedding: string | null;
  totalCalls: number | null;
  successRate: string | null;
  avgLatencyMs: string | null;
  p95LatencyMs: string | null;
  popularityScore: string | null;
  reliabilityScore: string | null;
  gradeBand: string | null;
  lastUpdated: Date | null;
}

const CANDIDATE_COLUMNS = {
  ...toolBaseColumns,
  inputSchema: tools.inputSchema,
  outputSchema: tools.outputSchema,
  embedding: tools.embedding,
  ...toolGlobalStatColumns,
  reliabilityScore: toolGlobalStats.reliabilityScore,
  gradeBand: toolGlobalStats.gradeBand,
} as const;

export async function discoverTools(
  query: DiscoverQuery,
  opts: { projectId?: string } = {},
): Promise<DiscoverResponse> {
  const { task, availableTools, context, currentInputSchema, limit } = query;

  // ── 1. Retrieve candidates ────────────────────────────────────────────────
  const conditions = buildConstraints(query);

  let candidates: CandidateRow[];
  if (availableTools && availableTools.length > 0) {
    // Rank WITHIN the agent's toolset — no text pre-filter, we score everything
    // the agent can call so even a weak text match still gets ranked.
    candidates = await runCandidateQuery([
      ...conditions,
      inArray(tools.slug, availableTools.map((s) => s.toLowerCase().trim())),
    ]);
  } else {
    candidates = await runCandidateQuery([...conditions, toolFtsMatch(task)]);
    // Fallback: no FTS hit → fall back to constraint-only top slice.
    if (candidates.length === 0) {
      candidates = await runCandidateQuery(conditions, 50);
    }
  }

  if (candidates.length === 0) {
    return { task, tools: [], dataFreshness: new Date().toISOString() };
  }

  // ── 2. Gather scoring signals ──────────────────────────────────────────────
  const relevanceText = context ? `${task}\n\n${context}` : task;
  const taskEmbedding = await getTaskEmbedding(relevanceText);
  const orgHistory = opts.projectId
    ? await loadOrgHistory(opts.projectId, candidates.map((c) => c.slug))
    : new Map<string, number | null>();

  const p95Values = candidates
    .filter((c) => c.p95LatencyMs !== null)
    .map((c) => parseFloat(c.p95LatencyMs!));
  const p95Median = median(p95Values) || 1000;

  // ── 3. Score ────────────────────────────────────────────────────────────────
  const scored = candidates.map((c) => {
    const isColdStart = (c.totalCalls ?? 0) < COLD_START_THRESHOLD;

    const taskRelevance = computeTaskRelevance(c, taskEmbedding, relevanceText);
    const reliability = c.successRate !== null ? parseFloat(c.successRate) * 100 : 80;
    const latency = computeLatencyScore(c.p95LatencyMs, p95Median);

    const fit =
      currentInputSchema && c.inputSchema
        ? computeSchemaFit(currentInputSchema, c.inputSchema)
        : null;
    const schemaFit = fit !== null ? fit * 100 : null;

    const orgHist = orgHistory.get(c.slug) ?? null;

    const score = computeDiscoveryScore({
      taskRelevance,
      reliability,
      latency,
      schemaFit,
      orgHistory: orgHist,
      isColdStart,
    });

    return { c, score, isColdStart, scores: { taskRelevance, schemaFit, reliability, orgHistory: orgHist, latency } };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  const dataFreshness =
    top
      .map((s) => s.c.lastUpdated)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ?? new Date().toISOString();

  const available = new Set((availableTools ?? []).map((s) => s.toLowerCase().trim()));

  const result: DiscoveredTool[] = top.map(({ c, score, isColdStart, scores }) =>
    toDiscoveredTool(c, {
      score,
      isColdStart,
      scores,
      reason: generateReason(c, scores, isColdStart),
      availableToCaller: available.has(c.slug),
    }),
  );

  return { task, tools: result, dataFreshness };
}

interface ScoreParts {
  taskRelevance: number;
  schemaFit: number | null;
  reliability: number;
  orgHistory: number | null;
  latency: number;
}

/** Map a scored catalog row to the wire `DiscoveredTool`. Shared by discover
 *  and rerank so the response shape never drifts between the two paths. */
function toDiscoveredTool(
  c: CandidateRow,
  opts: {
    score: number;
    isColdStart: boolean;
    scores: ScoreParts;
    reason: string;
    availableToCaller: boolean;
  },
): DiscoveredTool {
  const { score, isColdStart, scores, reason, availableToCaller } = opts;
  return {
    slug: c.slug,
    name: c.name,
    category: c.category as DiscoveredTool["category"],
    score: round1(score),
    scores: {
      taskRelevance: round1(scores.taskRelevance),
      schemaFit: scores.schemaFit !== null ? round1(scores.schemaFit) : null,
      reliability: round1(scores.reliability),
      orgHistory: scores.orgHistory !== null ? round1(scores.orgHistory) : null,
      latency: round1(scores.latency),
    },
    reason,
    inputSchema: c.inputSchema,
    outputSchema: c.outputSchema,
    successRate: c.successRate !== null ? parseFloat(c.successRate) : null,
    p95LatencyMs: c.p95LatencyMs !== null ? parseFloat(c.p95LatencyMs) : null,
    popularityScore: c.popularityScore !== null ? parseFloat(c.popularityScore) : null,
    sentimentScore: c.sentimentScore !== null ? parseFloat(c.sentimentScore) : null,
    isOpenSource: c.isOpenSource,
    isSelfHostable: c.isSelfHostable,
    pricingModel: c.pricingModel as DiscoveredTool["pricingModel"],
    dataResidency: (c.dataResidency ?? []) as DiscoveredTool["dataResidency"],
    dataSource: (isColdStart ? "seeded" : c.dataSource) as DiscoveredTool["dataSource"],
    website: c.website,
    docsUrl: c.docsUrl,
    availableToCaller,
    reliabilityScore: c.reliabilityScore !== null ? parseFloat(c.reliabilityScore) : null,
    gradeBand: (c.gradeBand as GradeBand | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rerank — Mode A: rank an externally-retrieved candidate list (spec 04)
// ---------------------------------------------------------------------------

/**
 * Rerank a candidate list that some upstream retriever (Anthropic Tool Search,
 * a vector index, …) already selected. We are the *quality* layer: retrieval
 * relevance is taken as a given, so scoring is biased toward intrinsic signals
 * (reliability, latency, org-history) via {@link computeRerankScore}.
 *
 * Candidates are resolved against the catalog by slug, falling back to a fuzzy
 * name match. Anything we can't resolve — or that has no telemetry — is NOT
 * dropped: it passes through with `reliabilityScore: null` and ranks *after*
 * every scored tool, so the agent still sees it.
 */
export async function rerankCandidates(
  query: RerankQuery,
  opts: { projectId?: string } = {},
): Promise<RerankResponse> {
  const { task, candidates, availableTools, limit } = query;

  // ── 1. Resolve candidates against the catalog ──────────────────────────────
  const requestedSlugs = candidates
    .map((c) => ("slug" in c ? c.slug.toLowerCase().trim() : null))
    .filter((s): s is string => s !== null);

  // Name-only candidates (no slug) — resolved by a targeted lower(name) match,
  // never a full-catalog scan (this runs on the agent's runtime path).
  const requestedNames = candidates
    .map((c) => (!("slug" in c) ? c.name.toLowerCase().trim() : null))
    .filter((s): s is string => s !== null);

  const rows =
    requestedSlugs.length > 0
      ? await runCandidateQuery([inArray(tools.slug, requestedSlugs)])
      : [];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  const nameRows =
    requestedNames.length > 0
      ? await runCandidateQuery([sql`lower(${tools.name}) = ANY(${requestedNames})`])
      : [];
  const byName = new Map(
    [...rows, ...nameRows].map((r) => [r.name.toLowerCase().trim(), r]),
  );

  // ── 2. Resolve + score, preserving the input order for unscored pass-through ─
  const orgHistory = opts.projectId
    ? await loadOrgHistory(opts.projectId, rows.map((r) => r.slug))
    : new Map<string, number | null>();

  const p95Values = rows
    .filter((r) => r.p95LatencyMs !== null)
    .map((r) => parseFloat(r.p95LatencyMs!));
  const p95Median = median(p95Values) || 1000;

  const available = new Set((availableTools ?? []).map((s) => s.toLowerCase().trim()));

  const scored: Array<{ tool: DiscoveredTool; score: number; resolved: boolean }> = [];

  for (const cand of candidates) {
    const row = resolveCandidate(cand, bySlug, byName);

    // Unresolved → synthesize a minimal pass-through tool (never dropped).
    if (!row) {
      scored.push({ tool: passthroughTool(cand, available), score: -1, resolved: false });
      continue;
    }

    const isColdStart = (row.totalCalls ?? 0) < COLD_START_THRESHOLD;
    const taskRelevance = computeTaskRelevance(row, null, task);
    const reliability = computeReliability(row);
    const latency = computeLatencyScore(row.p95LatencyMs, p95Median);
    const orgHist = orgHistory.get(row.slug) ?? null;
    const scores: ScoreParts = {
      taskRelevance,
      schemaFit: null,
      reliability,
      orgHistory: orgHist,
      latency,
    };
    const score = computeRerankScore({ reliability, latency, orgHistory: orgHist, taskRelevance, isColdStart });

    scored.push({
      tool: toDiscoveredTool(row, {
        score,
        isColdStart,
        scores,
        reason: generateReason(row, scores, isColdStart),
        availableToCaller: available.has(row.slug),
      }),
      score,
      resolved: true,
    });
  }

  // ── 3. Scored tools first (by score desc), then unresolved in input order ────
  const resolved = scored.filter((s) => s.resolved).sort((a, b) => b.score - a.score);
  const unresolved = scored.filter((s) => !s.resolved);
  const ranked = [...resolved, ...unresolved].map((s) => s.tool);

  return { task, ranked: limit ? ranked.slice(0, limit) : ranked };
}

/** Resolve one candidate to a catalog row: slug first, then exact-name. */
function resolveCandidate(
  cand: RerankQuery["candidates"][number],
  bySlug: Map<string, CandidateRow>,
  byName: Map<string, CandidateRow>,
): CandidateRow | null {
  if ("slug" in cand) {
    return bySlug.get(cand.slug.toLowerCase().trim()) ?? null;
  }
  return byName.get(cand.name.toLowerCase().trim()) ?? null;
}

/** A candidate the catalog doesn't know — surfaced with null intrinsic signals
 *  so the agent still sees it, but it sorts after everything we can score. */
function passthroughTool(
  cand: RerankQuery["candidates"][number],
  available: Set<string>,
): DiscoveredTool {
  const slug = "slug" in cand ? cand.slug.toLowerCase().trim() : slugify(cand.name);
  const name = "slug" in cand ? cand.slug : cand.name;
  return {
    slug,
    name,
    category: "other",
    score: 0,
    scores: { taskRelevance: 0, schemaFit: null, reliability: 0, orgHistory: null, latency: 0 },
    reason: "Unknown to the catalog — no reliability data yet; passed through unranked.",
    inputSchema: null,
    outputSchema: null,
    successRate: null,
    p95LatencyMs: null,
    popularityScore: null,
    sentimentScore: null,
    isOpenSource: false,
    isSelfHostable: false,
    pricingModel: null,
    dataResidency: [],
    dataSource: "community",
    website: null,
    docsUrl: null,
    availableToCaller: available.has(slug),
    reliabilityScore: null,
    gradeBand: null,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Reliability signal for rerank: prefer the published Reliability Score (spec
 *  01) when present, else fall back to raw success-rate, else neutral 80. */
function computeReliability(c: CandidateRow): number {
  if (c.reliabilityScore !== null) return clamp(parseFloat(c.reliabilityScore), 0, 100);
  if (c.successRate !== null) return clamp(parseFloat(c.successRate) * 100, 0, 100);
  return 80;
}

export interface RerankScoreInput {
  reliability: number; // 0–100
  latency: number; // 0–100
  orgHistory: number | null; // 0–100 or null
  taskRelevance: number; // 0–100
  isColdStart: boolean;
}

/**
 * Rerank weighting profile. Retrieval already decided relevance upstream, so we
 * bias toward *intrinsic* quality: reliability 55% · latency 20% · org-history
 * 15% · a small task-relevance tiebreak 10%. orgHistory is dropped + its weight
 * redistributed when null (neutral, never a penalty). Cold-start tools are
 * capped so thin data can't out-rank a proven tool.
 */
export function computeRerankScore(i: RerankScoreInput): number {
  const parts: Array<{ v: number; w: number }> = [
    { v: i.reliability, w: 0.55 },
    { v: i.latency, w: 0.2 },
    { v: i.taskRelevance, w: 0.1 },
  ];
  if (i.orgHistory !== null) parts.push({ v: i.orgHistory, w: 0.15 });

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const raw = parts.reduce((s, p) => s + p.v * p.w, 0) / totalW;
  return i.isColdStart ? Math.min(raw, COLD_START_SCORE_CAP) : raw;
}

// ---------------------------------------------------------------------------
// Pure scoring helpers (unit-tested without a DB)
// ---------------------------------------------------------------------------

export interface DiscoveryScoreInput {
  taskRelevance: number; // 0–100
  reliability: number; // 0–100
  latency: number; // 0–100
  schemaFit: number | null; // 0–100 or null (unknown)
  orgHistory: number | null; // 0–100 or null (no trusted history)
  isColdStart: boolean;
}

/**
 * Blend the components into a 0–100 score. Weights:
 *   taskRelevance 35% · reliability 25% · schemaFit 15% · orgHistory 15% · latency 10%
 * Optional components (schemaFit, orgHistory) are dropped when null and their
 * weight is redistributed proportionally — an absent signal is neutral, never a
 * penalty. Cold-start tools are capped so thin data can't top a proven tool.
 */
export function computeDiscoveryScore(i: DiscoveryScoreInput): number {
  const parts: Array<{ v: number; w: number }> = [
    { v: i.taskRelevance, w: 0.35 },
    { v: i.reliability, w: 0.25 },
    { v: i.latency, w: 0.1 },
  ];
  if (i.schemaFit !== null) parts.push({ v: i.schemaFit, w: 0.15 });
  if (i.orgHistory !== null) parts.push({ v: i.orgHistory, w: 0.15 });

  const totalW = parts.reduce((s, p) => s + p.w, 0);
  const raw = parts.reduce((s, p) => s + p.v * p.w, 0) / totalW;
  return i.isColdStart ? Math.min(raw, COLD_START_SCORE_CAP) : raw;
}

/**
 * Keyword-overlap relevance, 0–100. Fraction of task terms found in the tool's
 * text, floored at 20 so a non-match in a constrained toolset still ranks on its
 * other merits rather than collapsing to zero. Used when semantic embeddings
 * are unavailable.
 */
export function keywordRelevance(task: string, text: string): number {
  const taskTokens = tokenize(task);
  if (taskTokens.size === 0) return 50;
  const textTokens = tokenize(text);
  let hits = 0;
  for (const t of taskTokens) if (textTokens.has(t)) hits++;
  return clamp(20 + (hits / taskTokens.size) * 80, 0, 100);
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t)),
  );
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "you",
  "are", "can", "use", "using", "tool", "tools", "best", "via", "how", "what",
]);

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

const TASK_EMBEDDING_CACHE_PREFIX = "agentgraph:emb:";
const TASK_EMBEDDING_TTL_S = 86_400; // 1 day — task text → vector is stable

/**
 * Embed the task text, caching the vector in Redis. The discover response cache
 * is keyed by the full body (task + availableTools + limit + ...), so the same
 * task asked with different toolsets would otherwise re-hit the embedding
 * provider on every request. This caches the expensive part — the vector — so
 * the per-request cost on the runtime hot path is a single Redis GET on a warm
 * key, not an external API round-trip. Degrades to a direct embed on cache error.
 */
async function getTaskEmbedding(text: string): Promise<number[] | null> {
  if (!embeddingsEnabled()) return null; // no provider → skip Redis entirely
  const model = process.env["EMBEDDING_MODEL"] ?? "default";
  const key =
    TASK_EMBEDDING_CACHE_PREFIX +
    createHash("sha256").update(`${model} ${text}`).digest("hex");

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as number[];
  } catch {
    // cache read failure → fall through and embed directly
  }

  const vec = await embedText(text);
  if (vec) {
    try {
      await redis.setex(key, TASK_EMBEDDING_TTL_S, JSON.stringify(vec));
    } catch {
      // best-effort cache write
    }
  }
  return vec;
}

function computeTaskRelevance(
  c: CandidateRow,
  taskEmbedding: number[] | null,
  relevanceText: string,
): number {
  if (taskEmbedding) {
    const toolEmbedding = parseStoredEmbedding(c.embedding);
    if (toolEmbedding && toolEmbedding.length === taskEmbedding.length) {
      // cosine ∈ [-1,1] → [0,100]
      return clamp(((cosineSimilarity(taskEmbedding, toolEmbedding) + 1) / 2) * 100, 0, 100);
    }
  }
  const text = `${c.name} ${c.description ?? ""} ${(c.tags ?? []).join(" ")}`;
  return keywordRelevance(relevanceText, text);
}

function computeLatencyScore(p95Raw: string | null, p95Median: number): number {
  const p95 = p95Raw !== null ? parseFloat(p95Raw) : p95Median;
  return clamp(100 - (p95 / p95Median) * 50, 0, 100);
}

async function loadOrgHistory(
  projectId: string,
  slugs: string[],
): Promise<Map<string, number | null>> {
  const out = new Map<string, number | null>();
  if (slugs.length === 0) return out;
  const rows = await db
    .select({
      toolSlug: toolUsageStats.toolSlug,
      calls: toolUsageStats.calls,
      errorCount: toolUsageStats.errorCount,
    })
    .from(toolUsageStats)
    .where(
      and(eq(toolUsageStats.projectId, projectId), inArray(toolUsageStats.toolSlug, slugs)),
    );
  for (const r of rows) {
    if (r.calls < ORG_HISTORY_MIN_CALLS) continue;
    out.set(r.toolSlug, clamp((1 - r.errorCount / r.calls) * 100, 0, 100));
  }
  return out;
}

function buildConstraints(query: DiscoverQuery) {
  const conditions = [];
  if (query.category) conditions.push(eq(tools.category, query.category));
  if (query.selfHosted) conditions.push(eq(tools.isSelfHostable, true));
  if (query.openSource) conditions.push(eq(tools.isOpenSource, true));
  if (query.maxCost) conditions.push(eq(tools.pricingModel, query.maxCost));
  if (query.dataResidency) {
    conditions.push(sql`${tools.dataResidency} @> ARRAY[${query.dataResidency}]::text[]`);
  }
  return conditions;
}

async function runCandidateQuery(
  conditions: ReturnType<typeof buildConstraints> | unknown[],
  limit?: number,
): Promise<CandidateRow[]> {
  const where =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? (conditions[0] as ReturnType<typeof and>)
        : and(...(conditions as Parameters<typeof and>));

  const base = db
    .select(CANDIDATE_COLUMNS)
    .from(tools)
    .leftJoin(toolGlobalStats, eq(tools.slug, toolGlobalStats.toolSlug))
    .where(where as ReturnType<typeof and>)
    .$dynamic();

  const rows = limit ? await base.limit(limit) : await base;
  return rows as CandidateRow[];
}

function generateReason(
  c: CandidateRow,
  scores: { taskRelevance: number; schemaFit: number | null; orgHistory: number | null },
  isColdStart: boolean,
): string {
  const parts: string[] = [];
  if (scores.taskRelevance >= 75) parts.push("strong task match");
  if (c.successRate !== null && parseFloat(c.successRate) > 0.95) {
    parts.push(`high reliability (${(parseFloat(c.successRate) * 100).toFixed(0)}% success)`);
  }
  if (scores.orgHistory !== null && scores.orgHistory >= 90) {
    parts.push("proven in your own traces");
  }
  if (scores.schemaFit !== null && scores.schemaFit >= 70) {
    parts.push("input schema closely matches what you have");
  }
  if (c.p95LatencyMs !== null && parseFloat(c.p95LatencyMs) < 500) {
    parts.push(`low latency (p95 ${Math.round(parseFloat(c.p95LatencyMs))}ms)`);
  }
  if (c.isOpenSource) parts.push("open source");
  if (isColdStart) parts.push("based on seeded benchmark data");
  if (parts.length === 0) return `Candidate in ${c.category} for this task.`;
  return capitalize(parts.join(", ")) + ".";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
