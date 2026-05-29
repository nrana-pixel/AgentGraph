import { type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { projects, organizations, orgMembers, users } from "../db/schema.js";
import { type AuthedRequest } from "./apiKeyAuth.js";
import { type ClerkAuthedRequest } from "./clerkSessionAuth.js";

// Sensitive mutations (minting/revoking API keys, managing webhooks, export
// configs) are restricted to org owners/admins. API-key auth is a machine
// credential already scoped to the project and admin-issued, so it is exempt.
const PRIVILEGED_ROLES = new Set(["owner", "admin"]);

interface ProjectAccessOptions {
  // When set, Clerk callers must hold an owner/admin role; the message is sent
  // verbatim in the 403 body so each route keeps its own wording.
  requirePrivilegedMessage?: string;
}

// Authorise the caller for `projectId` under the dual auth pattern and return
// the project id on success. On failure it sends the 403 and returns null, so
// callers bail with `if (!resolved) return;`.
//
//   - API-key auth: the key is already bound to a project; only the matching
//     project id is allowed (mismatch → 403 forbidden).
//   - Clerk session: the caller must be a member of the project's org (miss →
//     403 forbidden), and an owner/admin when a privileged message is supplied.
export async function resolveProjectAccess(
  req: Request,
  res: Response,
  projectId: string,
  options: ProjectAccessOptions = {},
): Promise<string | null> {
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
