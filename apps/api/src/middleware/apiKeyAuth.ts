import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { apiKeys, projects, organizations } from "../db/schema.js";

export interface AuthedRequest extends Request {
  projectId: string;
  orgId: string;
  orgPlan: string;
}

// Cache validated keys in memory for 60s to reduce bcrypt overhead
const keyCache = new Map<string, { projectId: string; orgId: string; orgPlan: string; expiresAt: number }>();
const KEY_CACHE_TTL_MS = 60_000;

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_api_key" });
    return;
  }

  const rawKey = authHeader.slice(7);

  // Check in-memory cache first
  const cached = keyCache.get(rawKey);
  if (cached && cached.expiresAt > Date.now()) {
    (req as AuthedRequest).projectId = cached.projectId;
    (req as AuthedRequest).orgId = cached.orgId;
    (req as AuthedRequest).orgPlan = cached.orgPlan;
    next();
    return;
  }

  // Fetch all non-revoked keys for prefix match then bcrypt verify
  const prefix = rawKey.slice(0, 12); // "ag_live_xxxx" first 12 chars
  const rows = await db
    .select({
      id: apiKeys.id,
      keyHash: apiKeys.keyHash,
      projectId: apiKeys.projectId,
      orgId: projects.orgId,
      orgPlan: organizations.plan,
    })
    .from(apiKeys)
    .innerJoin(projects, eq(apiKeys.projectId, projects.id))
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .where(and(eq(apiKeys.revoked, false)));

  for (const row of rows) {
    const match = await bcrypt.compare(rawKey, row.keyHash);
    if (match) {
      // Update last_used_at asynchronously (fire and forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, row.id))
        .catch(() => {});

      keyCache.set(rawKey, {
        projectId: row.projectId,
        orgId: row.orgId,
        orgPlan: row.orgPlan,
        expiresAt: Date.now() + KEY_CACHE_TTL_MS,
      });

      (req as AuthedRequest).projectId = row.projectId;
      (req as AuthedRequest).orgId = row.orgId;
      (req as AuthedRequest).orgPlan = row.orgPlan;
      next();
      return;
    }
  }

  res.status(401).json({ error: "invalid_api_key" });
}
