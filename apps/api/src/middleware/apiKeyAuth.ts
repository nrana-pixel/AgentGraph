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
const KEY_CACHE_MAX_ENTRIES = 10_000;

// The display prefix persisted at mint time is rawKey.slice(0, 16)
// ("ag_live_" + 8 hex). Auth narrows candidates by this exact prefix.
const KEY_PREFIX_LEN = 16;

// Bound the cache: drop expired entries first, then evict oldest (Map keeps
// insertion order) until under the cap. Prevents unbounded growth on a
// long-lived process that sees many distinct keys.
function evictKeyCacheIfNeeded(): void {
  if (keyCache.size < KEY_CACHE_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of keyCache) {
    if (v.expiresAt <= now) keyCache.delete(k);
  }
  while (keyCache.size >= KEY_CACHE_MAX_ENTRIES) {
    const oldest = keyCache.keys().next().value;
    if (oldest === undefined) break;
    keyCache.delete(oldest);
  }
}

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

  // Narrow to the (typically single) key sharing this exact display prefix,
  // then bcrypt-verify. The idx_api_keys_key_prefix index keeps this O(1)
  // regardless of how many keys exist system-wide.
  const prefix = rawKey.slice(0, KEY_PREFIX_LEN);
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
    .where(and(eq(apiKeys.keyPrefix, prefix), eq(apiKeys.revoked, false)));

  for (const row of rows) {
    const match = await bcrypt.compare(rawKey, row.keyHash);
    if (match) {
      // Update last_used_at asynchronously (fire and forget)
      db.update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, row.id))
        .catch(() => {});

      evictKeyCacheIfNeeded();
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
