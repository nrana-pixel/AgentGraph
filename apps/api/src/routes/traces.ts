import { Router, type Request, type Response } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { traces, traceSteps, projects, organizations, orgMembers, users } from "../db/schema.js";
import { type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { TraceListFilterSchema, type TraceRow } from "@agentgraph/types";

const router = Router();
type TraceRecord = typeof traces.$inferSelect;

function toIsoString(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(0).toISOString();
}

function toNullableIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return toIsoString(value);
}

function toTraceRow(row: TraceRecord): TraceRow {
  return {
    id: row.id,
    projectId: row.projectId,
    agentId: row.agentId,
    sessionId: row.sessionId ?? null,
    userId: row.userId ?? null,
    env: row.env as TraceRow["env"],
    status: row.status as TraceRow["status"],
    totalLatencyMs: row.totalLatencyMs ?? null,
    totalTokens: row.totalTokens ?? null,
    totalCostUsd: row.totalCostUsd ?? null,
    metadata: row.metadata ?? "{}",
    startedAt: toIsoString(row.startedAt),
    endedAt: toNullableIsoString(row.endedAt),
  };
}

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

    res.json({ traces: rows.map(toTraceRow), page, limit });
  },
);

router.get(
  "/:id",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

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

    res.json({ trace: toTraceRow(trace), steps });
  },
);

export default router;
