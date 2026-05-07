import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { IngestPayloadSchema } from "@agentgraph/types";
import { redis, INGEST_QUEUE_KEY } from "../db/redis.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { db } from "../db/index.js";
import { organizations, projects } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

const PLAN_TRACE_LIMITS: Record<string, number> = {
  free: 10_000,
  pro: 500_000,
  team: 5_000_000,
};

router.post(
  "/",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;

    // Check trace quota
    const [org] = await db
      .select({
        plan: organizations.plan,
        tracesUsed: organizations.tracesUsedThisMonth,
      })
      .from(projects)
      .innerJoin(organizations, eq(projects.orgId, organizations.id))
      .where(eq(projects.id, authed.projectId));

    if (!org) {
      res.status(401).json({ error: "project_not_found" });
      return;
    }

    const limit = PLAN_TRACE_LIMITS[org.plan] ?? PLAN_TRACE_LIMITS["free"]!;
    if (org.tracesUsed >= limit) {
      res.status(402).json({
        error: "trace_limit_exceeded",
        message: `Your ${org.plan} plan allows ${limit.toLocaleString()} traces/month. Upgrade to continue ingesting.`,
      });
      return;
    }

    const parsed = IngestPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "validation_error",
        message: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }

    const traceId = parsed.data.traceId ?? uuidv4();
    const payload = { ...parsed.data, traceId, projectId: authed.projectId };

    // Push to Redis ingest queue — returns immediately
    await redis.lpush(INGEST_QUEUE_KEY, JSON.stringify(payload));

    // Increment usage counter asynchronously
    db.update(organizations)
      .set({
        tracesUsedThisMonth: org.tracesUsed + 1,
      })
      .where(eq(organizations.id, authed.orgId))
      .catch(() => {});

    res.json({
      traceId,
      stepsQueued: parsed.data.steps.length,
      status: "queued",
    });
  },
);

export default router;
