import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { projects, organizations, orgMembers, users } from "../db/schema.js";
import { type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { ShadowReplayRequestSchema } from "@agentgraph/types";
import { getToolUsage } from "../services/toolUsageRollup.js";
import { getSwapRecommendations } from "../services/swapRecommendations.js";
import { replayToolSwap } from "../services/shadowReplay.js";

const router = Router();

// Resolve and authorise the :id project for the caller. Returns the projectId
// (string) on success; on failure it sends a 403 and returns null. These are
// read/compute endpoints, so any org member may access them — no role gate.
async function resolveProject(req: Request, res: Response): Promise<string | null> {
  const { id } = req.params as { id: string };

  // API-key auth: the key is already bound to a project.
  if ((req as AuthedRequest).projectId) {
    if ((req as AuthedRequest).projectId !== id) {
      res.status(403).json({ error: "forbidden" });
      return null;
    }
    return id;
  }

  // Clerk session: the caller must be a member of the project's org.
  const authed = req as ClerkAuthedRequest;
  const [row] = await db
    .select({ projectId: projects.id })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(and(eq(projects.id, id), eq(users.clerkId, authed.clerkUserId)));

  if (!row) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }
  return row.projectId;
}

// GET /:id/insights/tool-usage — per-tool observed usage rollup (Tier 3.1 input)
router.get(
  "/:id/insights/tool-usage",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const projectId = await resolveProject(req, res);
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
    const projectId = await resolveProject(req, res);
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
    const projectId = await resolveProject(req, res);
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
