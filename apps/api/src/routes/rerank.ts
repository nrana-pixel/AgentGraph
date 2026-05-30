import { Router, type Request, type Response } from "express";
import { RerankQuerySchema } from "@agentgraph/types";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { rerankCandidates } from "../services/discoveryEngine.js";
import { redis } from "../db/redis.js";

const router = Router();

const RERANK_CACHE_PREFIX = "agentgraph:rerank:";
// Short TTL: like /discover, rerank is called at agent runtime with a
// high-cardinality body (task + candidate list), so we cache only to absorb
// tight retry loops.
const RERANK_CACHE_TTL_S = 60;

// POST /v1/rerank — the quality layer above an upstream tool retriever
// (Anthropic Tool Search, a vector index, …). Takes a pre-selected candidate
// list and reranks it by real-world reliability. Returns DiscoveredTool[],
// reusing the /discover item shape.
router.post("/", rateLimiter, flexAuth, async (req: Request, res: Response): Promise<void> => {
  const parsed = RerankQuerySchema.safeParse(req.body);
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
  const cacheKey = `${RERANK_CACHE_PREFIX}${projectId ?? "_"}:${JSON.stringify(query)}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    res.json(JSON.parse(cached));
    return;
  }

  const result = await rerankCandidates(query, { projectId });

  await redis.setex(cacheKey, RERANK_CACHE_TTL_S, JSON.stringify(result));
  res.json(result);
});

export default router;
