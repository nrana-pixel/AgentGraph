import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, and, gte, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { tools, toolGlobalStats, toolGlobalStatsHistory } from "../db/schema.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { clerkSessionAuth } from "../middleware/clerkSessionAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import {
  RecommendQuerySchema,
  PaginationSchema,
  type ToolReliabilityResponse,
  type ToolHealthResponse,
} from "@agentgraph/types";
import {
  detectRegressions,
  type ToolSnapshot,
} from "../lib/regressionDetect.js";
import { getRecommendations } from "../services/recommendationEngine.js";
import { redis, RECOMMEND_CACHE_PREFIX } from "../db/redis.js";

const router = Router();

const RECOMMEND_CACHE_TTL_S = 300; // 5 minutes

const EMPTY_ERROR_TAXONOMY = {
  timeout: 0,
  auth: 0,
  rate_limit: 0,
  schema: 0,
  "5xx": 0,
  other: 0,
};

function parseQualityIssues(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : null;
  } catch {
    return null;
  }
}

function safeJson(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Flexible auth for dashboard + SDK reads.
 * ag_* tokens → apiKeyAuth (SDK runtime); anything else → clerkSessionAuth (dashboard).
 */
async function flexAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bearer = req.headers["authorization"]?.slice(7) ?? "";
  if (bearer.startsWith("ag_")) {
    return apiKeyAuth(req, res, next);
  }
  return clerkSessionAuth(req, res, next);
}

// GET /v1/tools/recommend — runtime tool recommendations (SDK + dashboard)
router.get(
  "/recommend",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RecommendQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const query = parsed.data;
    const cacheKey = `${RECOMMEND_CACHE_PREFIX}${JSON.stringify(query)}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const result = await getRecommendations(query);

    await redis.setex(cacheKey, RECOMMEND_CACHE_TTL_S, JSON.stringify(result));
    res.json(result);
  },
);

// GET /v1/tools — list tool catalog (dashboard + SDK)
router.get(
  "/",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PaginationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const { page, limit } = parsed.data;
    const rawCategory = req.query["category"];
    if (rawCategory !== undefined && typeof rawCategory !== "string") {
      res.status(400).json({ error: "validation_error", message: "category must be a single string value" });
      return;
    }
    const category = rawCategory;

    let query = db
      .select({
        id: tools.id,
        slug: tools.slug,
        name: tools.name,
        description: tools.description,
        category: tools.category,
        website: tools.website,
        docsUrl: tools.docsUrl,
        githubUrl: tools.githubUrl,
        isOpenSource: tools.isOpenSource,
        isSelfHostable: tools.isSelfHostable,
        pricingModel: tools.pricingModel,
        dataResidency: tools.dataResidency,
        tags: tools.tags,
        dataSource: tools.dataSource,
        sentimentScore: tools.sentimentScore,
        successRate: toolGlobalStats.successRate,
        avgLatencyMs: toolGlobalStats.avgLatencyMs,
        p95LatencyMs: toolGlobalStats.p95LatencyMs,
        totalCalls: toolGlobalStats.totalCalls,
        popularityScore: toolGlobalStats.popularityScore,
        reliabilityScore: toolGlobalStats.reliabilityScore,
        gradeBand: toolGlobalStats.gradeBand,
        descriptionQualityScore: tools.descriptionQualityScore,
        qualityIssues: tools.qualityIssues,
      })
      .from(tools)
      .leftJoin(toolGlobalStats, eq(tools.slug, toolGlobalStats.toolSlug))
      .$dynamic();

    if (category) {
      query = query.where(eq(tools.category, category));
    }

    const rows = await query.limit(limit).offset((page - 1) * limit);

    // qualityIssues is stored as a JSON string; surface it as a parsed array
    // to match the ToolListItem contract.
    const toolsOut = rows.map((r) => ({
      ...r,
      qualityIssues: parseQualityIssues(r.qualityIssues),
    }));

    // Return project scope only for API key auth
    const projectId = (req as AuthedRequest).projectId ?? null;
    res.json({ tools: toolsOut, page, limit, projectId });
  },
);

// GET /v1/tools/:slug/reliability — public Reliability Score (spec 01)
router.get(
  "/:slug/reliability",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params as { slug: string };

    const [tool] = await db
      .select({
        slug: tools.slug,
        name: tools.name,
        category: tools.category,
        dataSource: tools.dataSource,
      })
      .from(tools)
      .where(eq(tools.slug, slug));

    if (!tool) {
      res.status(404).json({ error: "tool_not_found" });
      return;
    }

    const [stats] = await db
      .select()
      .from(toolGlobalStats)
      .where(eq(toolGlobalStats.toolSlug, slug));

    const distinctOrgs = stats?.distinctOrgs ?? 0;
    // Min-k anonymity: a score is only published once it survives the
    // aggregator's gate (>= K distinct orgs) AND a stats row exists.
    const hasScore = !!stats && stats.reliabilityScore !== null;

    const errorTaxonomy = stats?.errorTaxonomy
      ? { ...EMPTY_ERROR_TAXONOMY, ...safeJson(stats.errorTaxonomy) }
      : EMPTY_ERROR_TAXONOMY;

    const response: ToolReliabilityResponse = {
      slug: tool.slug,
      name: tool.name,
      category: tool.category,
      reliabilityScore: hasScore ? Number(stats.reliabilityScore) : null,
      gradeBand: hasScore
        ? (stats.gradeBand as ToolReliabilityResponse["gradeBand"])
        : null,
      successRate: stats?.successRate != null ? Number(stats.successRate) : null,
      p95LatencyMs: stats?.p95LatencyMs != null ? Number(stats.p95LatencyMs) : null,
      costPerCallUsd:
        stats?.costPerCallUsd != null ? Number(stats.costPerCallUsd) : null,
      errorTaxonomy,
      distinctOrgs,
      totalCalls: stats?.totalCalls ?? 0,
      dataSource: tool.dataSource,
      status: hasScore ? "ok" : "insufficient_data",
      lastUpdated: stats?.lastUpdated ? stats.lastUpdated.toISOString() : null,
    };

    res.json(response);
  },
);

// GET /v1/tools/:slug/health — "Downdetector" status + 30d sparkline (spec 02)
router.get(
  "/:slug/health",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params as { slug: string };

    const [tool] = await db
      .select({ slug: tools.slug, name: tools.name })
      .from(tools)
      .where(eq(tools.slug, slug));
    if (!tool) {
      res.status(404).json({ error: "tool_not_found" });
      return;
    }

    const num = (v: unknown): number | null =>
      v === null || v === undefined ? null : Number(v);

    // Last 30 days of history, newest first, for the sparkline + baseline.
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
    const history = await db
      .select({
        date: toolGlobalStatsHistory.date,
        successRate: toolGlobalStatsHistory.successRate,
        p95LatencyMs: toolGlobalStatsHistory.p95LatencyMs,
        costPerCallUsd: toolGlobalStatsHistory.costPerCallUsd,
        totalCalls: toolGlobalStatsHistory.totalCalls,
      })
      .from(toolGlobalStatsHistory)
      .where(
        and(
          eq(toolGlobalStatsHistory.toolSlug, slug),
          gte(toolGlobalStatsHistory.date, thirtyDaysAgo.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(desc(toolGlobalStatsHistory.date));

    const sparkline = [...history].reverse().map((h) => ({
      date: String(h.date),
      successRate: num(h.successRate),
      p95LatencyMs: num(h.p95LatencyMs),
    }));

    // Current = newest snapshot; baseline = the trailing 7 before it.
    const [current, ...rest] = history;
    let status: ToolHealthResponse["status"] = "healthy";
    let lastRegression: ToolHealthResponse["lastRegression"] = null;

    if (current) {
      const cur: ToolSnapshot = {
        successRate: num(current.successRate),
        p95LatencyMs: num(current.p95LatencyMs),
        costPerCallUsd: num(current.costPerCallUsd),
        totalCalls: num(current.totalCalls),
      };
      const baseline: ToolSnapshot[] = rest.slice(0, 7).map((h) => ({
        successRate: num(h.successRate),
        p95LatencyMs: num(h.p95LatencyMs),
        costPerCallUsd: num(h.costPerCallUsd),
        totalCalls: num(h.totalCalls),
      }));

      const regressions = detectRegressions(cur, baseline);
      if (regressions.length > 0) {
        status = "regressed";
        const r = regressions[0]!;
        const pick = (m: typeof r.current): number | null =>
          r.kind === "latency"
            ? m.p95LatencyMs
            : r.kind === "cost"
              ? m.costPerCallUsd
              : m.successRate;
        lastRegression = {
          kind: r.kind,
          detectedAt: new Date().toISOString(),
          current: pick(r.current),
          baseline: pick(r.baseline),
        };
      } else if (
        baseline.length > 0 &&
        cur.successRate !== null &&
        sparkline.length >= 2 &&
        (() => {
          const prev = baseline
            .map((b) => b.successRate)
            .filter((v): v is number => v !== null);
          const med = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
          return med !== null && cur.successRate! < med; // any drop below baseline, sub-threshold
        })()
      ) {
        status = "degraded";
      }
    }

    const response: ToolHealthResponse = {
      slug: tool.slug,
      name: tool.name,
      status,
      lastRegression,
      sparkline,
    };
    res.json(response);
  },
);

// GET /v1/tools/:slug — tool profile + global stats (dashboard + SDK)
router.get(
  "/:slug",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { slug } = req.params as { slug: string };

    const [tool] = await db.select().from(tools).where(eq(tools.slug, slug));

    if (!tool) {
      res.status(404).json({ error: "tool_not_found" });
      return;
    }

    const [stats] = await db
      .select()
      .from(toolGlobalStats)
      .where(eq(toolGlobalStats.toolSlug, slug));

    res.json({ tool, stats: stats ?? null });
  },
);

export default router;
