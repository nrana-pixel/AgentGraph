import { Router, type Request, type Response, type NextFunction } from "express";
import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { webhooks, projects, organizations, orgMembers, users } from "../db/schema.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { clerkSessionAuth, type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { CreateWebhookSchema } from "@agentgraph/types";

const router = Router();

async function flexAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bearer = req.headers["authorization"]?.slice(7) ?? "";
  if (bearer.startsWith("ag_")) {
    return apiKeyAuth(req, res, next);
  }
  return clerkSessionAuth(req, res, next);
}

async function resolveProjectFromClerk(req: Request, res: Response): Promise<string | null> {
  const authed = req as ClerkAuthedRequest;
  const { projectId } = req.params as { projectId: string };

  const [row] = await db
    .select({ projectId: projects.id })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(and(eq(projects.id, projectId), eq(users.clerkId, authed.clerkUserId)));

  if (!row) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }
  return row.projectId;
}

// POST /v1/projects/:projectId/webhooks
router.post(
  "/:projectId/webhooks",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { projectId } = req.params as { projectId: string };

    let resolvedProjectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== projectId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      resolvedProjectId = projectId;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      resolvedProjectId = resolved;
    }

    const parsed = CreateWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const secret = randomBytes(32).toString("hex");
    const [webhook] = await db
      .insert(webhooks)
      .values({ projectId: resolvedProjectId, url: parsed.data.url, events: parsed.data.events, secret })
      .returning();

    if (!webhook) {
      res.status(500).json({ error: "internal_server_error" });
      return;
    }

    res.status(201).json({ ...webhook, secret });
  },
);

// PATCH /v1/projects/:projectId/webhooks/:webhookId — toggle enabled
router.patch(
  "/:projectId/webhooks/:webhookId",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { projectId, webhookId } = req.params as { projectId: string; webhookId: string };

    let resolvedProjectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== projectId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      resolvedProjectId = projectId;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      resolvedProjectId = resolved;
    }

    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "validation_error", message: "enabled must be a boolean" });
      return;
    }

    const updated = await db
      .update(webhooks)
      .set({ enabled })
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.projectId, resolvedProjectId)))
      .returning({ id: webhooks.id, enabled: webhooks.enabled });

    if (updated.length === 0) {
      res.status(404).json({ error: "webhook_not_found" });
      return;
    }

    res.json(updated[0]);
  },
);

// DELETE /v1/projects/:projectId/webhooks/:webhookId
router.delete(
  "/:projectId/webhooks/:webhookId",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { projectId, webhookId } = req.params as { projectId: string; webhookId: string };

    let resolvedProjectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== projectId) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      resolvedProjectId = projectId;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      resolvedProjectId = resolved;
    }

    const deleted = await db
      .delete(webhooks)
      .where(and(eq(webhooks.id, webhookId), eq(webhooks.projectId, resolvedProjectId)))
      .returning({ id: webhooks.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "webhook_not_found" });
      return;
    }

    res.json({ deleted: true });
  },
);

export default router;
