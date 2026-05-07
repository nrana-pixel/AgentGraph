import type { NextFunction, Request, Response } from "express";
import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizations } from "../db/schema.js";

const clerkClient = createClerkClient({
  secretKey: process.env["CLERK_SECRET_KEY"],
});

export interface ClerkAuthedRequest extends Request {
  clerkUserId: string;
  clerkOrgId: string | null; // Active Clerk org ID from JWT claims
  dbOrgId: string | null;    // Resolved internal UUID from organizations table
}

/**
 * Verifies a Clerk session JWT in the Authorization: Bearer header.
 * Populates req.clerkUserId and req.clerkOrgId from JWT claims.
 * Resolves req.dbOrgId from the organizations table when org_id is present.
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

  try {
    const payload = await clerkClient.verifyToken(token);

    const clerkOrgId = (payload["org_id"] as string | undefined) ?? null;

    let dbOrgId: string | null = null;
    if (clerkOrgId) {
      const [org] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.clerkOrgId, clerkOrgId));
      dbOrgId = org?.id ?? null;
    }

    (req as ClerkAuthedRequest).clerkUserId = payload.sub;
    (req as ClerkAuthedRequest).clerkOrgId = clerkOrgId;
    (req as ClerkAuthedRequest).dbOrgId = dbOrgId;
    next();
  } catch {
    res.status(401).json({ error: "invalid_session_token" });
  }
}
