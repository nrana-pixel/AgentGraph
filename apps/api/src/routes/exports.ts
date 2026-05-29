import { Router, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { projectExportConfigs } from "../db/schema.js";
import { flexAuth } from "../middleware/flexAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";
import { resolveProjectAccess } from "../middleware/projectAccess.js";
import { CreateExportConfigSchema, UpdateExportConfigSchema } from "@agentgraph/types";

// Per-project warehouse / object-store export configs (Tier 2.4). Mounted at
// /v1/projects, so paths here are /:id/exports[...]. API keys are
// project-scoped machine credentials (exempt from role checks); Clerk callers
// must be owner/admin to create/update/delete.
const router = Router();

const MANAGE_EXPORTS_DENY = "Only organization owners or admins can perform this action.";

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
    const projectId = await resolveProjectAccess(req, res, (req.params as { id: string }).id);
    if (!projectId) return;

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
    const projectId = await resolveProjectAccess(req, res, (req.params as { id: string }).id, {
      requirePrivilegedMessage: MANAGE_EXPORTS_DENY,
    });
    if (!projectId) return;

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

    const projectId = await resolveProjectAccess(req, res, id, {
      requirePrivilegedMessage: MANAGE_EXPORTS_DENY,
    });
    if (!projectId) return;

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

    const projectId = await resolveProjectAccess(req, res, id, {
      requirePrivilegedMessage: MANAGE_EXPORTS_DENY,
    });
    if (!projectId) return;

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
