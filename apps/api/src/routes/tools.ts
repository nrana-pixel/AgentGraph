import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tools, toolGlobalStats } from "../db/schema.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { clerkSessionAuth } from "../middleware/clerkSessionAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { RecommendQuerySchema, PaginationSchema } from "@agentgraph/types";
import { getRecommendations } from "../services/recommendationEngine.js";
import { redis, RECOMMEND_CACHE_PREFIX } from "../db/redis.js";

const router = Router();

const RECOMMEND_CACHE_TTL_S = 300; // 5 minutes

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
      })
      .from(tools)
      .leftJoin(toolGlobalStats, eq(tools.slug, toolGlobalStats.toolSlug))
      .$dynamic();

    if (category) {
      query = query.where(eq(tools.category, category));
    }

    const rows = await query.limit(limit).offset((page - 1) * limit);

    // Return project scope only for API key auth
    const projectId = (req as AuthedRequest).projectId ?? null;
    res.json({ tools: rows, page, limit, projectId });
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
