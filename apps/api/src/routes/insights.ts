import { Router, type Request, type Response } from "express";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { resolveProjectAccess } from "../middleware/projectAccess.js";
import { ShadowReplayRequestSchema } from "@agentgraph/types";
import { getToolUsage } from "../services/toolUsageRollup.js";
import { getSwapRecommendations } from "../services/swapRecommendations.js";
import { replayToolSwap } from "../services/shadowReplay.js";

const router = Router();

// These are read/compute endpoints, so any org member may access them — no role gate.

// GET /:id/insights/tool-usage — per-tool observed usage rollup (Tier 3.1 input)
router.get(
  "/:id/insights/tool-usage",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const projectId = await resolveProjectAccess(req, res, (req.params as { id: string }).id);
    if (!projectId) return;
    res.json(await getToolUsage(projectId));
  },
);

// GET /:id/insights/recommendations — trace-driven tool-swap recommendations
router.get(
  "/:id/insights/recommendations",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const projectId = await resolveProjectAccess(req, res, (req.params as { id: string }).id);
    if (!projectId) return;
    res.json(await getSwapRecommendations(projectId));
  },
);

// POST /:id/insights/shadow-replay — offline replay scoring of a candidate swap
router.post(
  "/:id/insights/shadow-replay",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const projectId = await resolveProjectAccess(req, res, (req.params as { id: string }).id);
    if (!projectId) return;

    const parsed = ShadowReplayRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const { currentTool, candidateSlug, windowDays } = parsed.data;
    res.json(await replayToolSwap(projectId, currentTool, candidateSlug, windowDays));
  },
);

export default router;
