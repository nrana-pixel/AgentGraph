import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { clerkSessionAuth, type ClerkAuthedRequest } from "../middleware/clerkSessionAuth.js";
import { rateLimiter } from "../middleware/rateLimiter.js";

const router = Router();

// DELETE /v1/users/me — GDPR account deletion
// Uses Clerk session auth; the actual cascade is driven by the Clerk webhook
// user.deleted event → FK ON DELETE CASCADE clears all project/trace data.
router.delete(
  "/me",
  rateLimiter,
  clerkSessionAuth,
  async (req: Request, res: Response): Promise<void> => {
    const authed = req as ClerkAuthedRequest;

    const deleted = await db
      .delete(users)
      .where(eq(users.clerkId, authed.clerkUserId))
      .returning({ id: users.id });

    if (deleted.length === 0) {
      // User not yet synced to DB — still acknowledge
    }

    res.json({
      message: "Account deletion initiated. All project data will be removed within 24 hours.",
    });
  },
);

export default router;
