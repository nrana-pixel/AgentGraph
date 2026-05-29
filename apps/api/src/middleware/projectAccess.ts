import { type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { projects, organizations, orgMembers, users } from "../db/schema.js";
import { type AuthedRequest } from "./apiKeyAuth.js";
import { type ClerkAuthedRequest } from "./clerkSessionAuth.js";

const PRIVILEGED_ROLES = new Set(["owner", "admin"]);

interface ProjectAccessOptions {
  // When set, Clerk callers must be owner/admin; sent verbatim in the 403 body.
  requirePrivilegedMessage?: string;
}

// Returns the project id when the caller may access it, else sends a 403 and
// returns null (callers bail with `if (!resolved) return;`).
export async function resolveProjectAccess(
  req: Request,
  res: Response,
  projectId: string,
  options: ProjectAccessOptions = {},
): Promise<string | null> {
  // API-key auth is a project-scoped machine credential — exempt from the role
  // gate; only its own project is allowed.
  if ((req as AuthedRequest).projectId) {
    if ((req as AuthedRequest).projectId !== projectId) {
      res.status(403).json({ error: "forbidden" });
      return null;
    }
    return projectId;
  }

  const authed = req as ClerkAuthedRequest;
  const [row] = await db
    .select({ projectId: projects.id, role: orgMembers.role })
    .from(projects)
    .innerJoin(organizations, eq(projects.orgId, organizations.id))
    .innerJoin(orgMembers, eq(organizations.id, orgMembers.orgId))
    .innerJoin(users, eq(orgMembers.userId, users.id))
    .where(and(eq(projects.id, projectId), eq(users.clerkId, authed.clerkUserId)));

  if (!row) {
    res.status(403).json({ error: "forbidden" });
    return null;
  }

  if (options.requirePrivilegedMessage && !PRIVILEGED_ROLES.has(row.role)) {
    res.status(403).json({ error: "insufficient_role", message: options.requirePrivilegedMessage });
    return null;
  }

  return row.projectId;
}
