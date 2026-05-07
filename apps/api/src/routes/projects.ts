import { Router, type Request, type Response } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { traces, traceSteps, projects, organizations, apiKeys } from "../db/schema.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { clerkSessionAuth, type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { CreateProjectSchema, CreateApiKeySchema } from "@agentgraph/types";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";

const router = Router();

// POST /v1/projects — create a new project
// Uses Clerk session auth (not apiKeyAuth) so new orgs can bootstrap
// without a pre-existing project API key.
router.post(
  "/",
  rateLimiter,
  clerkSessionAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as ClerkAuthedRequest;

    if (!authed.dbOrgId) {
      res.status(400).json({
        error: "no_active_org",
        message:
          "Set an active Clerk organization in your session before creating a project.",
      });
      return;
    }

    const parsed = CreateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const slug =
      parsed.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) +
      "-" +
      randomBytes(3).toString("hex");

    const [project] = await db
      .insert(projects)
      .values({ orgId: authed.dbOrgId, name: parsed.data.name, slug })
      .returning();

    res.status(201).json(project);
  },
);

// GET /v1/projects/:id/stats — aggregated cost/tokens/traces by day
router.get(
  "/:id/stats",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;
    const { id } = req.params as { id: string };

    if (id !== authed.projectId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const fromParam = req.query["from"] as string | undefined;
    const toParam = req.query["to"] as string | undefined;
    const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 86400_000);
    const to = toParam ? new Date(toParam) : new Date();

    if (Number.isNaN(from.getTime())) {
      res.status(400).json({ error: "invalid_param", message: "from is not a valid date" });
      return;
    }
    if (Number.isNaN(to.getTime())) {
      res.status(400).json({ error: "invalid_param", message: "to is not a valid date" });
      return;
    }
    if (from > to) {
      res.status(400).json({ error: "invalid_param", message: "from must be before to" });
      return;
    }

    // Daily trace counts + cost + tokens
    const dailyStats = await db
      .select({
        date: sql<string>`DATE(${traces.startedAt})`.as("date"),
        traceCount: sql<number>`COUNT(*)::int`.as("trace_count"),
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${traces.status} = 'completed')::int`.as("completed_count"),
        errorCount: sql<number>`COUNT(*) FILTER (WHERE ${traces.status} = 'error')::int`.as("error_count"),
        totalTokens: sql<number>`COALESCE(SUM(${traces.totalTokens}), 0)::int`.as("total_tokens"),
        totalCostUsd: sql<number>`COALESCE(SUM(${traces.totalCostUsd}::numeric), 0)`.as("total_cost_usd"),
      })
      .from(traces)
      .where(
        and(
          eq(traces.projectId, id),
          gte(traces.startedAt, from),
          lte(traces.startedAt, to),
        ),
      )
      .groupBy(sql`DATE(${traces.startedAt})`)
      .orderBy(sql`DATE(${traces.startedAt})`);

    // Cost by model (from trace_steps)
    const costByModel = await db
      .select({
        model: traceSteps.model,
        totalTokens: sql<number>`COALESCE(SUM(${traceSteps.totalTokens}), 0)::int`.as("total_tokens"),
        totalCostUsd: sql<number>`COALESCE(SUM(${traceSteps.costUsd}::numeric), 0)`.as("total_cost_usd"),
        callCount: sql<number>`COUNT(*)::int`.as("call_count"),
      })
      .from(traceSteps)
      .innerJoin(traces, eq(traceSteps.traceId, traces.id))
      .where(
        and(
          eq(traces.projectId, id),
          eq(traceSteps.type, "llm_call"),
          gte(traces.startedAt, from),
          lte(traces.startedAt, to),
        ),
      )
      .groupBy(traceSteps.model)
      .orderBy(desc(sql`COALESCE(SUM(${traceSteps.costUsd}::numeric), 0)`));

    // Top agents by call volume
    const topAgents = await db
      .select({
        agentId: traces.agentId,
        traceCount: sql<number>`COUNT(*)::int`.as("trace_count"),
        errorRate: sql<number>`ROUND(COUNT(*) FILTER (WHERE ${traces.status} = 'error')::numeric / NULLIF(COUNT(*), 0), 4)`.as("error_rate"),
        avgLatencyMs: sql<number>`ROUND(AVG(${traces.totalLatencyMs}))::int`.as("avg_latency_ms"),
      })
      .from(traces)
      .where(
        and(
          eq(traces.projectId, id),
          gte(traces.startedAt, from),
          lte(traces.startedAt, to),
        ),
      )
      .groupBy(traces.agentId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    // Totals summary
    const [totals] = await db
      .select({
        traceCount: sql<number>`COUNT(*)::int`,
        totalCostUsd: sql<number>`COALESCE(SUM(${traces.totalCostUsd}::numeric), 0)`,
        totalTokens: sql<number>`COALESCE(SUM(${traces.totalTokens}), 0)::int`,
        errorRate: sql<number>`ROUND(COUNT(*) FILTER (WHERE ${traces.status} = 'error')::numeric / NULLIF(COUNT(*), 0), 4)`,
      })
      .from(traces)
      .where(
        and(
          eq(traces.projectId, id),
          gte(traces.startedAt, from),
          lte(traces.startedAt, to),
        ),
      );

    res.json({
      projectId: id,
      from: from.toISOString(),
      to: to.toISOString(),
      totals,
      dailyStats,
      costByModel,
      topAgents,
    });
  },
);

// POST /v1/projects/:id/api-keys — create a named API key
router.post(
  "/:id/api-keys",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;
    const { id } = req.params as { id: string };

    if (id !== authed.projectId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const parsed = CreateApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const rawKey = `ag_live_${uuidv4().replace(/-/g, "")}`;
    const keyPrefix = rawKey.slice(0, 16); // "ag_live_" + 8 chars
    const keyHash = await bcrypt.hash(rawKey, 10);

    const [apiKey] = await db
      .insert(apiKeys)
      .values({
        projectId: id,
        keyHash,
        keyPrefix,
        name: parsed.data.name ?? null,
      })
      .returning({
        id: apiKeys.id,
        projectId: apiKeys.projectId,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
      });

    // Return raw key only once — never stored in plaintext
    res.status(201).json({ ...apiKey, key: rawKey });
  },
);

// DELETE /v1/projects/:id/api-keys/:keyId — revoke a key
router.delete(
  "/:id/api-keys/:keyId",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;
    const { id, keyId } = req.params as { id: string; keyId: string };

    if (id !== authed.projectId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const updated = await db
      .update(apiKeys)
      .set({ revoked: true })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, id)))
      .returning({ id: apiKeys.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "api_key_not_found" });
      return;
    }

    res.json({ revoked: true });
  },
);

export default router;
