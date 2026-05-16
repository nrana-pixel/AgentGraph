import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizations } from "../db/schema.js";

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

    let dbOrgId: string | null = null;
    if (clerkOrgId) {
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrgId));
      dbOrgId = org?.id ?? null;
    }

    (req as ClerkAuthedRequest).clerkUserId = claims.sub;
    (req as ClerkAuthedRequest).clerkOrgId = clerkOrgId;
    (req as ClerkAuthedRequest).dbOrgId = dbOrgId;
    next();
  } catch {
    res.status(401).json({ error: "invalid_session_token" });
  }
}
