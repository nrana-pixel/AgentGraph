import { Router, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { projects, organizations, orgMembers, users, projectExportConfigs } from "../db/schema.js";
import { type AuthedRequest } from "../middleware/apiKeyAuth.js";
import { type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { CreateExportConfigSchema, UpdateExportConfigSchema } from "@agentgraph/types";

// Per-project warehouse / object-store export configs (Tier 2.4). Mounted at
// /v1/projects, so paths here are /:id/exports[...]. Auth + gating mirror the
// API-key/Clerk dual pattern used throughout routes/projects.ts: API keys are
// project-scoped machine credentials (exempt from role checks); Clerk callers
// must be owner/admin to create/update/delete. These resolve/deny helpers are
// a per-file convention — replicated here intentionally, not shared.
const router = Router();

interface ResolvedProject {
  projectId: string;
  role: string;
}

async function resolveProjectFromClerk(req: Request, res: Response): Promise<ResolvedProject | null> {
  const authed = req as ClerkAuthedRequest;
  const { id } = req.params as { id: string };

  const [row] = await db
    .select({ projectId: projects.id, role: orgMembers.role })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(and(eq(projects.id, id), eq(users.clerkId, authed.clerkUserId)));

  if (!row) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }
  return { projectId: row.projectId, role: row.role };
}

const PRIVILEGED_ROLES = new Set(["owner", "admin"]);

function denyIfNotPrivileged(role: string, res: Response): boolean {
  if (PRIVILEGED_ROLES.has(role)) return false;
  res.status(403).json({
    error: "insufficient_role",
    message: "Only organization owners or admins can perform this action.",
  });
  return true;
}

function serialize(row: typeof projectExportConfigs.$inferSelect) {
  return {
    id: row.id,
    projectId: row.projectId,
    destination: row.destination,
    config: JSON.parse(row.config) as Record<string, unknown>,
    format: row.format,
    enabled: row.enabled,
    highWaterMark: row.highWaterMark ? row.highWaterMark.toISOString() : null,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
  };
}

router.get(
  "/:id/exports",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      projectId = resolved.projectId;
    }

    const rows = await db
      .select()
      .from(projectExportConfigs)
      .where(eq(projectExportConfigs.projectId, projectId))
      .orderBy(desc(projectExportConfigs.createdAt));

    res.json({ exports: rows.map(serialize) });
  },
);

router.post(
  "/:id/exports",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      if (denyIfNotPrivileged(resolved.role, res)) return;
      projectId = resolved.projectId;
    }

    const parsed = CreateExportConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    const [created] = await db
      .insert(projectExportConfigs)
      .values({
        projectId,
        destination: parsed.data.destination,
        config: JSON.stringify(parsed.data.config),
        format: parsed.data.format,
        enabled: parsed.data.enabled,
      })
      .returning();

    res.status(201).json(serialize(created!));
  },
);

router.patch(
  "/:id/exports/:configId",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id, configId } = req.params as { id: string; configId: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      if (denyIfNotPrivileged(resolved.role, res)) return;
      projectId = resolved.projectId;
    }

    const parsed = UpdateExportConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error" });
      return;
    }

    // Patch only the keys the caller supplied. config is re-serialized to JSON.
    const patch: {
      destination?: string;
      config?: string;
      format?: string;
      enabled?: boolean;
    } = {};
    if (parsed.data.destination !== undefined) patch.destination = parsed.data.destination;
    if (parsed.data.config !== undefined) patch.config = JSON.stringify(parsed.data.config);
    if (parsed.data.format !== undefined) patch.format = parsed.data.format;
    if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;

    const updated = await db
      .update(projectExportConfigs)
      .set(patch)
      .where(and(eq(projectExportConfigs.id, configId), eq(projectExportConfigs.projectId, projectId)))
      .returning();

    if (updated.length === 0) {
      res.status(404).json({ error: "export_config_not_found" });
      return;
    }

    res.json(serialize(updated[0]!));
  },
);

router.delete(
  "/:id/exports/:configId",
  rateLimiter,
  flexAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { id, configId } = req.params as { id: string; configId: string };

    let projectId: string;
    if ((req as AuthedRequest).projectId) {
      if ((req as AuthedRequest).projectId !== id) {
        res.status(403).json({ error: "forbidden" });
        return;
      }
      projectId = id;
    } else {
      const resolved = await resolveProjectFromClerk(req, res);
      if (!resolved) return;
      if (denyIfNotPrivileged(resolved.role, res)) return;
      projectId = resolved.projectId;
    }

    const deleted = await db
      .delete(projectExportConfigs)
      .where(and(eq(projectExportConfigs.id, configId), eq(projectExportConfigs.projectId, projectId)))
      .returning({ id: projectExportConfigs.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "export_config_not_found" });
      return;
    }

    res.json({ deleted: true });
  },
);

export default router;
