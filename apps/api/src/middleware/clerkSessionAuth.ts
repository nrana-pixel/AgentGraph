import type { NextFunction, Request, Response } from "express";
import { verifyToken, createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizations, orgMembers, users } from "../db/schema.js";

interface ClerkSessionAuthConfig {
  secretKey: string;
  authorizedParties?: string[];
  audience?: string;
}

function getAuthorizedParties(): string[] | undefined {
  const raw = process.env["CLERK_AUTHORIZED_PARTIES"];
  if (!raw) return undefined;
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function getClerkSessionAuthConfig(): ClerkSessionAuthConfig | null {
  const secretKey = process.env["CLERK_SECRET_KEY"];
  if (!secretKey) return null;

  const authorizedParties = getAuthorizedParties();
  const audience = process.env["CLERK_JWT_AUDIENCE"] || undefined;

  return {
    secretKey,
    ...(authorizedParties ? { authorizedParties } : {}),
    ...(audience ? { audience } : {}),
  };
}

export function reportClerkSessionAuthConfig(): void {
  if (!process.env["CLERK_SECRET_KEY"]) {
    console.error(
      "[api] CLERK_SECRET_KEY is unset. Clerk dashboard session routes will return 503 until it is configured.",
    );
    return;
  }

  // Comma-separated origins/parties that may issue tokens for this API.
  // In prod: set to your dashboard's public origin(s), e.g.
  //   CLERK_AUTHORIZED_PARTIES=https://app.agentgraph.dev,https://agentgraph.dev
  // Mitigates subdomain cookie leak — see Clerk JWT verification docs.
  if (process.env["NODE_ENV"] === "production" && !getAuthorizedParties()) {
    console.warn(
      "[api] CLERK_AUTHORIZED_PARTIES is unset in production; Clerk azp claim will not be validated.",
    );
  }
}

export interface ClerkAuthedRequest extends Request {
  clerkUserId: string;
  clerkOrgId: string | null; // Active Clerk org ID from JWT claims
  dbOrgId: string | null;    // Resolved internal UUID from organizations table
}

interface SessionClaims {
  sub: string;
  org_id?: string;
}

/**
 * Runtime-validate the decoded JWT payload. `verifyToken` confirms signature +
 * exp/nbf/azp/aud, but the returned `data` is typed as JwtPayload — we still
 * need to check the shape of the claims we trust.
 */
function validateSessionClaims(data: unknown): SessionClaims | null {
  if (!data || typeof data !== "object") return null;
  const p = data as Record<string, unknown>;
  if (typeof p["sub"] !== "string" || p["sub"].length === 0) return null;
  const orgId = p["org_id"];
  if (orgId !== undefined && (typeof orgId !== "string" || orgId.length === 0)) return null;
  return { sub: p["sub"], ...(typeof orgId === "string" ? { org_id: orgId } : {}) };
}

/**
 * Verifies a Clerk session JWT in the Authorization: Bearer header.
 * Populates req.clerkUserId and req.clerkOrgId from JWT claims.
 * Resolves req.dbOrgId from the organizations table when org_id is present.
 *
 * Signature/exp/nbf/azp/aud are checked by Clerk's verifyToken;
 * required claim shapes are then validated before req mutation.
 */
export async function clerkSessionAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "missing_session_token" });
    return;
  }

  const config = getClerkSessionAuthConfig();
  if (!config) {
    console.error("[clerkSessionAuth] CLERK_SECRET_KEY is unset; refusing Clerk session authentication.");
    res.status(503).json({
      error: "auth_not_configured",
      message: "Clerk session authentication is not configured.",
    });
    return;
  }

  try {
    const result = await verifyToken(token, {
      secretKey: config.secretKey,
      ...(config.authorizedParties ? { authorizedParties: config.authorizedParties } : {}),
      ...(config.audience ? { audience: config.audience } : {}),
    });

    const claims = validateSessionClaims(result);
    if (!claims) {
      res.status(401).json({ error: "invalid_session_token" });
      return;
    }

    const clerkOrgId = claims.org_id ?? null;

    let dbOrgId = await resolveDbOrgId(claims.sub, clerkOrgId);

    // Self-heal: if the DB has no record of this user or their org, the Clerk
    // webhook may not be configured, may have failed delivery, or may simply
    // not have arrived yet. Fetch from Clerk and backfill rather than 400'ing.
    if (dbOrgId === null) {
      await backfillFromClerk(config.secretKey, claims.sub, clerkOrgId);
      dbOrgId = await resolveDbOrgId(claims.sub, clerkOrgId);
    }

    (req as ClerkAuthedRequest).clerkUserId = claims.sub;
    (req as ClerkAuthedRequest).clerkOrgId = clerkOrgId;
    (req as ClerkAuthedRequest).dbOrgId = dbOrgId;
    next();
  } catch {
    res.status(401).json({ error: "invalid_session_token" });
  }
}

/**
 * Resolve a Clerk user → DB user row, treating email as canonical identity.
 * Returns the DB user id (uuid) or null if the Clerk user has no primary
 * email or the lookup fails.
 *
 * Why email and not clerk_id: if a user is deleted + recreated in Clerk (or
 * the user.deleted webhook is missed), Clerk issues a new clerk_id but the
 * email is reused. Keying on clerk_id alone causes a UNIQUE(email) violation
 * on insert.
 */
export async function upsertUserByEmail(
  client: ReturnType<typeof createClerkClient>,
  clerkUserId: string,
): Promise<string | null> {
  const clerkUser = await client.users.getUser(clerkUserId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (e) => e.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress;
  if (!primaryEmail) return null;
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;

  // Email is the unique target — if a row already exists for this email,
  // update its clerk_id to match the current Clerk identity.
  const [row] = await db
    .insert(users)
    .values({ clerkId: clerkUserId, email: primaryEmail, name })
    .onConflictDoUpdate({
      target: users.email,
      set: { clerkId: clerkUserId, name },
    })
    .returning({ id: users.id });
  return row?.id ?? null;
}

async function resolveDbOrgId(
  clerkUserId: string,
  clerkOrgId: string | null,
): Promise<string | null> {
  if (clerkOrgId) {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId));
    if (org) return org.id;
  }
  // Fall back to the user's first org membership in the DB.
  const [membership] = await db
    .select({ orgId: orgMembers.orgId })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(users.clerkId, clerkUserId))
    .limit(1);
  return membership?.orgId ?? null;
}

/**
 * On-demand sync from Clerk → DB. Covers missing/misconfigured webhooks and
 * race conditions where a user/org was just created and the DB hasn't caught
 * up. Best-effort: any failure here is logged and swallowed so the caller can
 * still respond with whatever dbOrgId state remains.
 */
async function backfillFromClerk(
  secretKey: string,
  clerkUserId: string,
  clerkOrgId: string | null,
): Promise<void> {
  try {
    const client = createClerkClient({ secretKey });

    // 1. Resolve the user row, treating email as canonical identity.
    // A user may have been deleted+re-created in Clerk with a new clerk_id
    // (especially likely if user.deleted wasn't subscribed on the webhook),
    // leaving a stale DB row with the old clerk_id but the same email.
    const dbUserId = await upsertUserByEmail(client, clerkUserId);
    if (!dbUserId) return;

    // 2. Pick which Clerk org to sync. Prefer the active one from the JWT;
    //    otherwise grab the first one the user belongs to.
    let targetOrgId = clerkOrgId;
    if (!targetOrgId) {
      const memberships = await client.users.getOrganizationMembershipList({
        userId: clerkUserId,
        limit: 1,
      });
      targetOrgId = memberships.data[0]?.organization.id ?? null;
    }
    if (!targetOrgId) return;

    // 3. Upsert the org
    const clerkOrg = await client.organizations.getOrganization({ organizationId: targetOrgId });
    const [orgInserted] = await db
      .insert(organizations)
      .values({ clerkOrgId: clerkOrg.id, name: clerkOrg.name, ownerId: dbUserId })
      .onConflictDoUpdate({
        target: organizations.clerkOrgId,
        set: { name: clerkOrg.name },
      })
      .returning({ id: organizations.id });
    const dbOrgId = orgInserted?.id;
    if (!dbOrgId) return;

    // 4. Upsert membership
    await db
      .insert(orgMembers)
      .values({ orgId: dbOrgId, userId: dbUserId, role: "owner" })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[clerkSessionAuth] backfill from Clerk failed:", err);
  }
}
