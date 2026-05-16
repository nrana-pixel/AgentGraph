import { Router, type Request, type Response } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { traces, traceSteps, projects, organizations, apiKeys, webhooks, orgMembers, users } from "../db/schema.js";
import { type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { clerkSessionAuth, type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { CreateProjectSchema, CreateApiKeySchema } from "@agentgraph/types";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";

const router = Router();

async function resolveProjectFromClerk(req: Request, res: Response): Promise<string | null> {
  const authed = req as ClerkAuthedRequest;
  const { id } = req.params as { id: string };

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

router.get(
  "/",
  rateLimiter,
  clerkSessionAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as ClerkAuthedRequest;

    const rows = await db
      .select({ id: projects.id, name: projects.name, slug: projects.slug, createdAt: projects.createdAt })
      .from(projects)
      .innerJoin(organizations, eq(projects.orgId, organizations.id))
      .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
      .innerJoin(users, eq(orgMembers.userId, users.id))
      .where(eq(users.clerkId, authed.clerkUserId))
      .orderBy(desc(projects.createdAt));

    res.json({ projects: rows });
  },
);

router.post(
  "/",
  rateLimiter,
  clerkSessionAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as ClerkAuthedRequest;

    if (!authed.dbOrgId) {
      res.status(400).json({
        error: "no_active_org",
        message: "Create an organization first — projects live under an organization.",
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

router.get(
  "/:id/stats",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
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

    const dailyStats = await db
      .select({
        date: sql<string>`DATE(${traces.startedAt})`.as("date"),
        traceCount: sql<number>`COUNT(*)::int`.as("trace_count"),
        completedCount: sql<number>`COUNT(*) FILTER (WHERE ${traces.status} = 'completed')::int`.as("completed_count"),
        errorCount: sql<number>`COUNT(*) FILTER (WHERE ${traces.status} = 'error')::int`.as("error_count"),
        totalTokens: sql<number>`COALESCE(SUM(${traces.totalTokens}), 0)::int`.as("total_tokens"),
        totalCostUsd: sql<number>`COALESCE(SUM(${traces.totalCostUsd}::numeric), 0)::float8`.as("total_cost_usd"),
      })
      .from(traces)
      .where(and(eq(traces.projectId, projectId), gte(traces.startedAt, from), lte(traces.startedAt, to)))
      .groupBy(sql`DATE(${traces.startedAt})`)
      .orderBy(sql`DATE(${traces.startedAt})`);

    const costByModel = await db
      .select({
        model: traceSteps.model,
        totalTokens: sql<number>`COALESCE(SUM(${traceSteps.totalTokens}), 0)::int`.as("total_tokens"),
        totalCostUsd: sql<number>`COALESCE(SUM(${traceSteps.costUsd}::numeric), 0)::float8`.as("total_cost_usd"),
        callCount: sql<number>`COUNT(*)::int`.as("call_count"),
      })
      .from(traceSteps)
      .innerJoin(traces, eq(traceSteps.traceId, traces.id))
      .where(and(eq(traces.projectId, projectId), eq(traceSteps.type, "llm_call"), gte(traces.startedAt, from), lte(traces.startedAt, to)))
      .groupBy(traceSteps.model)
      .orderBy(desc(sql`COALESCE(SUM(${traceSteps.costUsd}::numeric), 0)::float8`));

    const topAgents = await db
      .select({
        agentId: traces.agentId,
        traceCount: sql<number>`COUNT(*)::int`.as("trace_count"),
        errorRate: sql<number>`(ROUND(COUNT(*) FILTER (WHERE ${traces.status} = 'error')::numeric / NULLIF(COUNT(*), 0), 4))::float8`.as("error_rate"),
        totalTokens: sql<number>`COALESCE(SUM(${traces.totalTokens}), 0)::int`.as("total_tokens"),
        totalCostUsd: sql<number>`COALESCE(SUM(${traces.totalCostUsd}::numeric), 0)::float8`.as("total_cost_usd"),
        avgLatencyMs: sql<number>`ROUND(AVG(${traces.totalLatencyMs}))::int`.as("avg_latency_ms"),
      })
      .from(traces)
      .where(and(eq(traces.projectId, projectId), gte(traces.startedAt, from), lte(traces.startedAt, to)))
      .groupBy(traces.agentId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);

    const [totals] = await db
      .select({
        traceCount: sql<number>`COUNT(*)::int`,
        totalCostUsd: sql<number>`COALESCE(SUM(${traces.totalCostUsd}::numeric), 0)::float8`,
        totalTokens: sql<number>`COALESCE(SUM(${traces.totalTokens}), 0)::int`,
        errorRate: sql<number>`(ROUND(COUNT(*) FILTER (WHERE ${traces.status} = 'error')::numeric / NULLIF(COUNT(*), 0), 4))::float8`,
      })
      .from(traces)
      .where(and(eq(traces.projectId, projectId), gte(traces.startedAt, from), lte(traces.startedAt, to)));

    res.json({ projectId, from: from.toISOString(), to: to.toISOString(), totals, dailyStats, costByModel, topAgents });
  },
);

router.get(
  "/:id/api-keys",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
    }

    const rows = await db
      .select({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
        lastUsedAt: apiKeys.lastUsedAt,
        revoked: apiKeys.revoked,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.projectId, projectId), eq(apiKeys.revoked, false)))
      .orderBy(desc(apiKeys.createdAt));

    res.json({ apiKeys: rows });
  },
);

router.post(
  "/:id/api-keys",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
    }

    const parsed = CreateApiKeySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const rawKey = `ag_live_${uuidv4().replace(/-/g, "")}`;
    const keyPrefix = rawKey.slice(0, 16);
    const keyHash = await bcrypt.hash(rawKey, 10);

    const [apiKey] = await db
      .insert(apiKeys)
      .values({ projectId, keyHash, keyPrefix, name: parsed.data.name ?? null })
      .returning({
        id: apiKeys.id,
        projectId: apiKeys.projectId,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        createdAt: apiKeys.createdAt,
      });

    res.status(201).json({ ...apiKey, key: rawKey });
  },
);

router.delete(
  "/:id/api-keys/:keyId",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id, keyId } = req.params as { id: string; keyId: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
    }

    const updated = await db
      .update(apiKeys)
      .set({ revoked: true })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.projectId, projectId)))
      .returning({ id: apiKeys.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "api_key_not_found" });
      return;
    }

    res.json({ revoked: true });
  },
);

router.get(
  "/:id/billing",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
    }

    const PLAN_LIMITS: Record<string, number> = { free: 10_000, pro: 500_000, team: 5_000_000 };

    const [row] = await db
      .select({ plan: organizations.plan, tracesUsed: organizations.tracesUsedThisMonth, stripeCustomerId: organizations.stripeCustomerId })
      .from(projects)
      .innerJoin(organizations, eq(projects.orgId, organizations.id))
      .where(eq(projects.id, projectId));

    if (!row) {
      res.status(404).json({ error: "project_not_found" });
      return;
    }

    const limit = PLAN_LIMITS[row.plan] ?? PLAN_LIMITS["free"]!;
    res.json({
      plan: row.plan,
      tracesUsed: row.tracesUsed,
      tracesLimit: limit,
      usagePct: Math.min(1, row.tracesUsed / limit),
      hasPaymentMethod: Boolean(row.stripeCustomerId),
    });
  },
);

router.get(
  "/:id/webhooks",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved;
    }

    const rows = await db
      .select({ id: webhooks.id, url: webhooks.url, events: webhooks.events, enabled: webhooks.enabled, createdAt: webhooks.createdAt })
      .from(webhooks)
      .where(eq(webhooks.projectId, projectId))
      .orderBy(desc(webhooks.createdAt));

    res.json({ webhooks: rows });
  },
);

export default router;
