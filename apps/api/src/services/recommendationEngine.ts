import { sql, and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tools, toolGlobalStats } from "../db/schema.js";
import type { RecommendQuery, RecommendResponse, ToolRecommendation } from "@agentgraph/types";

const COLD_START_THRESHOLD = 50;
const COLD_START_SCORE_CAP = 70;

interface ToolWithStats {
  id: string;
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
  totalCalls: number;
  successRate: string | null;
  avgLatencyMs: string | null;
  p95LatencyMs: string | null;
  popularityScore: string | null;
  lastUpdated: Date | null;
}

type ToolWithNullableStats = Omit<ToolWithStats, "totalCalls"> & {
  totalCalls: number | null;
};

export async function getRecommendations(
  query: RecommendQuery,
): Promise<RecommendResponse> {
  const { task, category, selfHosted, openSource, dataResidency, maxCost, limit } = query;

  // Build hard constraint filters
  const conditions = [];

  if (category) conditions.push(eq(tools.category, category));
  if (selfHosted) conditions.push(eq(tools.isSelfHostable, true));
  if (openSource) conditions.push(eq(tools.isOpenSource, true));
  if (maxCost) conditions.push(eq(tools.pricingModel, maxCost));
  if (dataResidency) {
    conditions.push(sql`${tools.dataResidency} @> ARRAY[${dataResidency}]::text[]`);
  }

  // Full-text search on name + description + tags
  const tsQuery = sql`plainto_tsquery('english', ${task})`;
  const tsVector = sql`to_tsvector('english', coalesce(${tools.name}, '') || ' ' || coalesce(${tools.description}, '') || ' ' || coalesce(immutable_array_to_string(${tools.tags}, ' '), ''))`;

  let candidates: ToolWithStats[] = normalizeToolStatsRows(
    await db
      .select({
        id: tools.id,
        slug: tools.slug,
        name: tools.name,
        description: tools.description,
        category: tools.category,
        website: tools.website,
        docsUrl: tools.docsUrl,
        isOpenSource: tools.isOpenSource,
        isSelfHostable: tools.isSelfHostable,
        pricingModel: tools.pricingModel,
        dataResidency: tools.dataResidency,
        tags: tools.tags,
        dataSource: tools.dataSource,
        sentimentScore: tools.sentimentScore,
        totalCalls: toolGlobalStats.totalCalls,
        successRate: toolGlobalStats.successRate,
        avgLatencyMs: toolGlobalStats.avgLatencyMs,
        p95LatencyMs: toolGlobalStats.p95LatencyMs,
        popularityScore: toolGlobalStats.popularityScore,
        lastUpdated: toolGlobalStats.lastUpdated,
      })
      .from(tools)
      .leftJoin(toolGlobalStats, eq(tools.slug, toolGlobalStats.toolSlug))
      .where(
        conditions.length > 0
          ? and(...conditions, sql`${tsVector} @@ ${tsQuery}`)
          : sql`${tsVector} @@ ${tsQuery}`,
      ),
  );

  // Fallback: if no full-text match, use category or top by popularity
  if (candidates.length === 0) {
    const fallbackConditions = conditions.length > 0 ? and(...conditions) : undefined;
    candidates = normalizeToolStatsRows(
      await db
        .select({
          id: tools.id,
          slug: tools.slug,
          name: tools.name,
          description: tools.description,
          category: tools.category,
          website: tools.website,
          docsUrl: tools.docsUrl,
          isOpenSource: tools.isOpenSource,
          isSelfHostable: tools.isSelfHostable,
          pricingModel: tools.pricingModel,
          dataResidency: tools.dataResidency,
          tags: tools.tags,
          dataSource: tools.dataSource,
          sentimentScore: tools.sentimentScore,
          totalCalls: toolGlobalStats.totalCalls,
          successRate: toolGlobalStats.successRate,
          avgLatencyMs: toolGlobalStats.avgLatencyMs,
          p95LatencyMs: toolGlobalStats.p95LatencyMs,
          popularityScore: toolGlobalStats.popularityScore,
          lastUpdated: toolGlobalStats.lastUpdated,
        })
        .from(tools)
        .leftJoin(toolGlobalStats, eq(tools.slug, toolGlobalStats.toolSlug))
        .where(fallbackConditions)
        .limit(50),
    );
  }

  // Compute category p95 median for latency normalisation
  const categoryP95Values = candidates
    .filter((t) => t.p95LatencyMs !== null)
    .map((t) => parseFloat(t.p95LatencyMs!));
  const categoryP95Median = median(categoryP95Values) || 1000;

  // Score each candidate
  const scored = candidates
    .map((t) => {
      const isColdStart = (t.totalCalls ?? 0) < COLD_START_THRESHOLD;
      return {
        tool: t,
        score: computeScore(t, categoryP95Median, isColdStart),
        isColdStart,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const dataFreshness =
    scored
      .map((s) => s.tool.lastUpdated)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0]
      ?.toISOString() ?? new Date().toISOString();

  const recommendations: ToolRecommendation[] = scored.map(({ tool, score, isColdStart }) => ({
    slug: tool.slug,
    name: tool.name,
    category: tool.category as ToolRecommendation["category"],
    score: Math.round(score * 10) / 10,
    successRate: tool.successRate !== null ? parseFloat(tool.successRate) : null,
    avgLatencyMs: tool.avgLatencyMs !== null ? parseFloat(tool.avgLatencyMs) : null,
    p95LatencyMs: tool.p95LatencyMs !== null ? parseFloat(tool.p95LatencyMs) : null,
    popularityScore: tool.popularityScore !== null ? parseFloat(tool.popularityScore) : null,
    sentimentScore: tool.sentimentScore !== null ? parseFloat(tool.sentimentScore) : null,
    isOpenSource: tool.isOpenSource,
    isSelfHostable: tool.isSelfHostable,
    pricingModel: tool.pricingModel as ToolRecommendation["pricingModel"],
    dataResidency: (tool.dataResidency ?? []) as ToolRecommendation["dataResidency"],
    reason: generateReason(tool, isColdStart),
    dataSource: (isColdStart ? "seeded" : tool.dataSource) as ToolRecommendation["dataSource"],
    website: tool.website,
    docsUrl: tool.docsUrl,
  }));

  return { task, recommendations, dataFreshness };
}

function normalizeToolStatsRows(rows: ToolWithNullableStats[]): ToolWithStats[] {
  return rows.map((row) => ({
    ...row,
    totalCalls: row.totalCalls ?? 0,
  }));
}

function computeScore(
  tool: ToolWithStats,
  categoryP95Median: number,
  isColdStart: boolean,
): number {
  const successRate = tool.successRate !== null ? parseFloat(tool.successRate) : 0.8;
  const successScore = successRate * 100;

  const p95 = tool.p95LatencyMs !== null ? parseFloat(tool.p95LatencyMs) : categoryP95Median;
  const latencyScore = Math.max(0, 100 - (p95 / categoryP95Median) * 50);

  const popularityScore =
    tool.popularityScore !== null ? parseFloat(tool.popularityScore) : 0;

  const sentimentScore =
    tool.sentimentScore !== null ? parseFloat(tool.sentimentScore) : 50;

  const raw =
    successScore * 0.4 +
    latencyScore * 0.2 +
    popularityScore * 0.25 +
    sentimentScore * 0.15;

  return isColdStart ? Math.min(raw, COLD_START_SCORE_CAP) : raw;
}

function generateReason(tool: ToolWithStats, isColdStart: boolean): string {
  const parts: string[] = [];

  const successRate =
    tool.successRate !== null ? parseFloat(tool.successRate) : null;

  if (successRate !== null) {
    if (successRate > 0.95) parts.push(`Highest success rate in ${tool.category} category`);
    else if (successRate > 0.9) parts.push(`Strong reliability record in ${tool.category}`);
  }

  const p95 = tool.p95LatencyMs !== null ? parseFloat(tool.p95LatencyMs) : null;
  if (p95 !== null && p95 < 500) parts.push(`low latency (p95: ${p95}ms)`);

  const sentimentScore =
    tool.sentimentScore !== null ? parseFloat(tool.sentimentScore) : null;
  if (sentimentScore !== null && sentimentScore > 80) parts.push("strong community sentiment");

  if (tool.isOpenSource) parts.push("open source");

  const residency = tool.dataResidency ?? [];
  if (residency.includes("EU")) parts.push("EU data residency available");

  if (isColdStart) parts.push("based on seeded benchmark data");

  if (parts.length === 0) return `Available in ${tool.category} category.`;

  return parts.join(", ") + ".";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}
