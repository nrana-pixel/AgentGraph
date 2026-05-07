import { Router, type Request, type Response } from "express";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { db } from "../db/index.js";
import { traces, traceSteps } from "../db/schema.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { TraceListFilterSchema } from "@agentgraph/types";

const router = Router();

// GET /v1/traces — list traces for a project
router.get(
  "/",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;
    const parsed = TraceListFilterSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const { page, limit, agentId, status, from, to, sessionId, userId } =
      parsed.data;

    const conditions = [eq(traces.projectId, authed.projectId)];
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
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;
    const { id } = req.params as { id: string };

    const [trace] = await db
      .select()
      .from(traces)
      .where(and(eq(traces.id, id), eq(traces.projectId, authed.projectId)));

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
