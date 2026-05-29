import { Router, type Request, type Response } from "express";
import { DiscoverQuerySchema } from "@agentgraph/types";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { discoverTools } from "../services/discoveryEngine.js";
import { redis } from "../db/redis.js";

const router = Router();

const DISCOVER_CACHE_PREFIX = "agentgraph:discover:";
// Short TTL: discovery is called at agent runtime with a high-cardinality body
// (task + available toolset), so we cache only to absorb tight retry loops.
const DISCOVER_CACHE_TTL_S = 60;

// POST /v1/discover — runtime tool discovery for agents (SDK + dashboard).
// Returns task-ranked tools WITH their input/output schemas so an agent can
// pick and call a tool without loading the whole catalog into its context.
router.post(
  "/",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = DiscoverQuerySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      });
      return;
    }

    const query = parsed.data;
    // Org history is per-project, so scope the cache by projectId too (null for
    // dashboard/Clerk reads that aren't bound to a project).
    const projectId = (req as AuthedRequest).projectId ?? undefined;
    const cacheKey = `${DISCOVER_CACHE_PREFIX}${projectId ?? "_"}:${JSON.stringify(query)}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      res.json(JSON.parse(cached));
      return;
    }

    const result = await discoverTools(query, { projectId });

    await redis.setex(cacheKey, DISCOVER_CACHE_TTL_S, JSON.stringify(result));
    res.json(result);
  },
);

export default router;
