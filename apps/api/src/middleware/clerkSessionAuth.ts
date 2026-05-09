import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { organizations } from "../db/schema.js";

export interface ClerkAuthedRequest extends Request {
  clerkUserId: string;
  clerkOrgId: string | null;
  dbOrgId: string | null;
}

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
    const secretKey = process.env["CLERK_SECRET_KEY"];
    const result = await verifyToken(token, {
      ...(secretKey !== undefined ? { secretKey } : {}),
    });

    if (result.errors) {
      res.status(401).json({ error: "invalid_session_token" });
      return;
    }

    const payload = result.data as { sub: string; [key: string]: unknown };
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
