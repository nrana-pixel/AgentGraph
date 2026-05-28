import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { webhooks, projects, organizations, orgMembers, users } from "../db/schema.js";
import { type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { assertPublicWebhookUrl } from "../lib/ssrfGuard.js";
import { encryptSecret } from "../lib/secretCrypto.js";
import { CreateWebhookSchema } from "@agentgraph/types";

const router = Router();

interface ResolvedProject {
  projectId: string;
  role: string;
}

async function resolveProjectFromClerk(req: Request, res: Response): Promise<ResolvedProject | null> {
  const authed = req as ClerkAuthedRequest;
  const { projectId } = req.params as { projectId: string };

  const [row] = await db
    .select({ projectId: projects.id, role: orgMembers.role })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(and(eq(projects.id, projectId), eq(users.clerkId, authed.clerkUserId)));

  if (!row) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }
  return { projectId: row.projectId, role: row.role };
}

// Webhook management is owner/admin-only over the dashboard. API-key auth is a
// machine credential scoped to the project and is exempt.
const PRIVILEGED_ROLES = new Set(["owner", "admin"]);

function denyIfNotPrivileged(role: string, res: Response): boolean {
  if (PRIVILEGED_ROLES.has(role)) return false;
  res.status(403).json({
    error: "insufficient_role",
    message: "Only organization owners or admins can manage webhooks.",
  });
  return true;
}

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
      if (denyIfNotPrivileged(resolved.role, res)) return;
      resolvedProjectId = resolved.projectId;
    }

    const parsed = CreateWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    // Reject internal/loopback/link-local targets up front (the worker also
    // re-checks at delivery time, which is the authoritative boundary).
    try {
      await assertPublicWebhookUrl(parsed.data.url);
    } catch (err) {
      res.status(400).json({
        error: "invalid_webhook_url",
        message: err instanceof Error ? err.message : "webhook url not allowed",
      });
      return;
    }

    const secret = randomBytes(32).toString("hex");
    const [webhook] = await db
      .insert(webhooks)
      .values({
        projectId: resolvedProjectId,
        url: parsed.data.url,
        events: parsed.data.events,
        secret: encryptSecret(secret),
      })
      .returning();

    if (!webhook) {
      res.status(500).json({ error: "internal_server_error" });
      return;
    }

    // Return the plaintext secret to the caller once; only the ciphertext is
    // persisted. Never echo the stored (possibly encrypted) column back.
    res.status(201).json({ ...webhook, secret });
  },
);

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
      if (denyIfNotPrivileged(resolved.role, res)) return;
      resolvedProjectId = resolved.projectId;
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
      if (denyIfNotPrivileged(resolved.role, res)) return;
      resolvedProjectId = resolved.projectId;
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
