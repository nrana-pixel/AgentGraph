import { Router, type Request, type Response } from "express";
import { Webhook } from "svix";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, organizations, orgMembers } from "../db/schema.js";
import { resolveUserIdentity } from "../middleware/clerkSessionAuth.js";

const router = Router();

interface ClerkUserCreatedEvent {
  type: "user.created" | "user.updated";
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
    first_name: string | null;
    last_name: string | null;
  };
}

interface ClerkUserDeletedEvent {
  type: "user.deleted";
  data: { id: string };
}

interface ClerkOrgCreatedEvent {
  type: "organization.created" | "organization.updated";
  data: {
    id: string;
    name: string;
    created_by: string; // clerk user id of creator
  };
}

interface ClerkOrgMemberCreatedEvent {
  type: "organizationMembership.created";
  data: {
    organization: { id: string };
    public_user_data: { user_id: string };
    role: string;
  };
}

type ClerkEvent =
  | ClerkUserCreatedEvent
  | ClerkUserDeletedEvent
  | ClerkOrgCreatedEvent
  | ClerkOrgMemberCreatedEvent;

/**
 * POST /v1/auth/webhooks/clerk
 * Receives Clerk webhook events and syncs to PostgreSQL.
 * Requires raw body for Svix signature verification.
 */
router.post(
  "/webhooks/clerk",
  async (req: Request, res: Response): Promise<void> => {
    const webhookSecret = process.env["CLERK_WEBHOOK_SECRET"];
    if (!webhookSecret) {
      res.status(500).json({ error: "webhook_secret_not_configured" });
      return;
    }

    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      res.status(400).json({ error: "missing_svix_headers" });
      return;
    }

    const wh = new Webhook(webhookSecret);
    let event: ClerkEvent;

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body);

    try {
      event = wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkEvent;
    } catch (err) {
      console.error("[clerk-webhook] signature verification failed:", err);
      res.status(400).json({ error: "invalid_webhook_signature" });
      return;
    }

    try {
      await handleClerkEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error("[clerk-webhook] handler error:", err);
      res.status(500).json({ error: "handler_error" });
    }
  },
);

async function handleClerkEvent(event: ClerkEvent): Promise<void> {
  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const primaryEmail = event.data.email_addresses.find(
        (e) => e.id === event.data.primary_email_address_id,
      );
      if (!primaryEmail) return;

      const name = [event.data.first_name, event.data.last_name]
        .filter(Boolean)
        .join(" ") || null;

      // Strict isolation: resolveUserIdentity refuses to rebind an email that
      // already belongs to a different clerk_id, so a reused email can never
      // silently inherit another user's data.
      await resolveUserIdentity(event.data.id, primaryEmail.email_address, name);
      break;
    }

    case "user.deleted": {
      // Cascade deletes handle projects/traces via FK constraints
      await db.delete(users).where(eq(users.clerkId, event.data.id));
      break;
    }

    case "organization.created":
    case "organization.updated": {
      const owner = event.type === "organization.created"
        ? await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.clerkId, event.data.created_by))
            .then((rows) => rows[0])
        : null;

      await db
        .insert(organizations)
        .values({
          clerkOrgId: event.data.id,
          name: event.data.name,
          ownerId: owner?.id ?? null,
        })
        .onConflictDoUpdate({
          target: organizations.clerkOrgId,
          set: { name: event.data.name },
        });
      break;
    }

    case "organizationMembership.created": {
      const [org, user] = await Promise.all([
        db
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.clerkOrgId, event.data.organization.id))
          .then((rows) => rows[0]),
        db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, event.data.public_user_data.user_id))
          .then((rows) => rows[0]),
      ]);

      if (!org || !user) return;

      const role = event.data.role === "org:admin" ? "admin"
        : event.data.role === "org:owner" ? "owner"
        : "member";

      await db
        .insert(orgMembers)
        .values({ orgId: org.id, userId: user.id, role })
        .onConflictDoNothing();
      break;
    }
  }
}

export default router;
