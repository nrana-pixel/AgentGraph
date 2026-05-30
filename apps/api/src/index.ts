import "dotenv/config";
// Patches Express 4's router so rejected promises from async handlers are
// forwarded to the error middleware instead of becoming unhandled rejections
// (Express 4 does not do this natively). Must import before the routes.
import "express-async-errors";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { db, closeDb } from "./db/index.js";
import { redis } from "./db/redis.js";
import { sql } from "drizzle-orm";
import { errorHandler } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import ingestRouter from "./routes/ingest.js";
import tracesRouter from "./routes/traces.js";
import toolsRouter from "./routes/tools.js";
import discoverRouter from "./routes/discover.js";
import rerankRouter from "./routes/rerank.js";
import webhooksRouter from "./routes/webhooks.js";
import projectsRouter from "./routes/projects.js";
import exportsRouter from "./routes/exports.js";
import insightsRouter from "./routes/insights.js";
import usersRouter from "./routes/users.js";
import { reportClerkSessionAuthConfig } from "./middleware/clerkSessionAuth.js";

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

reportClerkSessionAuthConfig();

// --- Global middleware ---
app.use(helmet());
app.use(
  cors({
    origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? ["http://localhost:3000"],
    credentials: true,
  }),
);

// Raw body needed for Svix webhook signature verification
app.use("/v1/auth/webhooks/clerk", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "2mb" }));

// --- Routes ---
// Liveness: is the process up at all (no dependency checks).
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: process.env["npm_package_version"] ?? "0.1.0" });
});

// Readiness: can we actually serve traffic? Checks DB + Redis so a node with a
// dead dependency is pulled from the load balancer instead of 5xx-ing requests.
app.get("/ready", async (_req, res) => {
  try {
    await Promise.all([db.execute(sql`SELECT 1`), redis.ping()]);
    res.json({ status: "ready" });
  } catch (err) {
    console.error("[api] readiness check failed:", err);
    res.status(503).json({ status: "not_ready" });
  }
});

app.use("/v1/auth", authRouter);
app.use("/v1/ingest", ingestRouter);
app.use("/v1/traces", tracesRouter);
app.use("/v1/tools", toolsRouter);
app.use("/v1/discover", discoverRouter);
app.use("/v1/rerank", rerankRouter);
app.use("/v1/projects", projectsRouter);
app.use("/v1/projects", webhooksRouter);
app.use("/v1/projects", exportsRouter);
app.use("/v1/projects", insightsRouter);
app.use("/v1/users", usersRouter);

// --- Error handler (must be last) ---
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});

// --- Graceful shutdown: stop accepting connections, drain in-flight requests,
//     then close DB + Redis so a rolling deploy doesn't drop live requests. ---
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[api] ${signal} received — shutting down gracefully`);
  const forceExit = setTimeout(() => {
    console.error("[api] graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000);
  forceExit.unref();
  server.close(async () => {
    try {
      await Promise.allSettled([closeDb(), redis.quit()]);
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  });
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Last-resort process guards: log loudly. A truly unexpected rejection/exception
// means inconsistent state, so exit non-zero and let the orchestrator restart.
process.on("unhandledRejection", (reason) => {
  console.error("[api] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[api] uncaughtException:", err);
  void shutdown("uncaughtException");
});

export default app;
