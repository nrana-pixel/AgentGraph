import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import { errorHandler } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import ingestRouter from "./routes/ingest.js";
import tracesRouter from "./routes/traces.js";
import toolsRouter from "./routes/tools.js";
import webhooksRouter from "./routes/webhooks.js";

const app = express();
const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

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
app.get("/health", (_req, res) => {
  res.json({ status: "ok", version: process.env["npm_package_version"] ?? "0.1.0" });
});

app.use("/v1/auth", authRouter);
app.use("/v1/ingest", ingestRouter);
app.use("/v1/traces", tracesRouter);
app.use("/v1/tools", toolsRouter);
app.use("/v1/projects", webhooksRouter);

// --- Error handler (must be last) ---
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`);
});

export default app;
