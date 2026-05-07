import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { tools, toolGlobalStats } from "../db/schema.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { RecommendQuerySchema } from "@agentgraph/types";
import { getRecommendations } from "../services/recommendationEngine.js";
import { redis, RECOMMEND_CACHE_PREFIX } from "../db/redis.js";
import { PaginationSchema } from "@agentgraph/types";

const router = Router();

const RECOMMEND_CACHE_TTL_S = 300; // 5 minutes

// GET /v1/tools/recommend — runtime tool recommendations
router.get(
  "/recommend",
  rateLimiter,
  apiKeyAuth,
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

    // Cache hit
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

// GET /v1/tools — list tool catalog
router.get(
  "/",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PaginationSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const { page, limit } = parsed.data;

    const rows = await db
      .select()
      .from(tools)
      .limit(limit)
      .offset((page - 1) * limit);

    res.json({ tools: rows, page, limit });
  },
);

// GET /v1/tools/:slug — tool profile + global stats
router.get(
  "/:slug",
  rateLimiter,
  apiKeyAuth,
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
