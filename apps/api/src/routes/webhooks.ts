import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { webhooks } from "../db/schema.js";
import { apiKeyAuth, type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { CreateWebhookSchema } from "@agentgraph/types";

const router = Router();

// POST /v1/projects/:projectId/webhooks
router.post(
  "/:projectId/webhooks",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;
    const { projectId } = req.params as { projectId: string };

    if (projectId !== authed.projectId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const parsed = CreateWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const secret = randomBytes(32).toString("hex");
    const [webhook] = await db
      .insert(webhooks)
      .values({
        projectId,
        url: parsed.data.url,
        events: parsed.data.events,
        secret,
      })
      .returning();

    if (!webhook) {
      res.status(500).json({ error: "internal_server_error" });
      return;
    }

    res.status(201).json({ ...webhook, secret }); // Return secret once
  },
);

// DELETE /v1/projects/:projectId/webhooks/:webhookId
router.delete(
  "/:projectId/webhooks/:webhookId",
  rateLimiter,
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as AuthedRequest;
    const { projectId, webhookId } = req.params as {
      projectId: string;
      webhookId: string;
    };

    if (projectId !== authed.projectId) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const deleted = await db
      .delete(webhooks)
      .where(
        and(eq(webhooks.id, webhookId), eq(webhooks.projectId, projectId)),
      )
      .returning({ id: webhooks.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "webhook_not_found" });
      return;
    }

    res.json({ deleted: true });
  },
);

export default router;
