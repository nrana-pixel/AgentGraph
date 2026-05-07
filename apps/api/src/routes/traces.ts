import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { traces, traceSteps, projects, organizations, orgMembers, users } from "../db/schema.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { clerkSessionAuth, type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { TraceListFilterSchema } from "@agentgraph/types";

const router = Router();

/**
 * Flexible auth: API keys (SDK clients) use apiKeyAuth; Clerk session tokens
 * (dashboard server components) use clerkSessionAuth.
 * API keys start with "ag_"; anything else is treated as a Clerk JWT.
 */
async function flexAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bearer = req.headers["authorization"]?.slice(7) ?? "";
  if (bearer.startsWith("ag_")) {
    return apiKeyAuth(req, res, next);
  }
  return clerkSessionAuth(req, res, next);
}

/**
 * Resolve the projectId for a Clerk-authenticated dashboard request.
 * Requires a `projectId` query param; verifies the user is an org member
 * that owns the requested project.
 */
async function resolveProjectFromClerk(
  req: Request,
  res: Response,
): Promise<string | null> {
  const authed = req as ClerkAuthedRequest;
  const projectId = req.query["projectId"] as string | undefined;

  if (!projectId) {
    res.status(400).json({ error: "projectId_required", message: "Pass ?projectId= for dashboard requests." });
    return null;
  }

  // Verify this project belongs to an org the clerk user is a member of
  const [row] = await db
    .select({ projectId: projects.id })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(
      and(
        eq(projects.id, projectId),
        eq(users.clerkId, authed.clerkUserId),
      ),
    );

  if (!row) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }

  return row.projectId;
}

// GET /v1/traces — list traces for a project
router.get(
  "/",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = TraceListFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    // Determine projectId from either apiKeyAuth or Clerk session
    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      projectId = (req as AuthedRequest).projectId;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
    }

    const { page, limit, agentId, status, from, to, sessionId, userId } = parsed.data;

    const conditions = [eq(traces.projectId, projectId)];
    if (agentId) conditions.push(eq(traces.agentId, agentId));
    if (status) conditions.push(eq(traces.status, status));
    if (sessionId) conditions.push(eq(traces.sessionId, sessionId));
    if (userId) conditions.push(eq(traces.userId, userId));
    if (from) conditions.push(gte(traces.startedAt, new Date(from)));
    if (to) conditions.push(lte(traces.startedAt, new Date(to)));

    const rows = await db
      .select()
      .from(traces)
      .where(and(...conditions))
      .orderBy(desc(traces.startedAt))
      .limit(limit)
      .offset((page - 1) * limit);

    res.json({ traces: rows, page, limit });
  },
);

// GET /v1/traces/:id — get a single trace with all steps
router.get(
  "/:id",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    // Determine projectId from either apiKeyAuth or Clerk session
    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      projectId = (req as AuthedRequest).projectId;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
    }

    const [trace] = await db
      .select()
      .from(traces)
      .where(and(eq(traces.id, id), eq(traces.projectId, projectId)));

    if (!trace) {
      res.status(404).json({ error: "trace_not_found" });
      return;
    }

    const steps = await db
      .select()
      .from(traceSteps)
      .where(eq(traceSteps.traceId, id))
      .orderBy(traceSteps.stepIndex);

    res.json({ trace, steps });
  },
);

export default router;
