import "dotenv/config";
import http from "node:http";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { startIngestConsumer } from "./consumers/ingestConsumer.js";
import { runStatsAggregator } from "./crons/statsAggregator.js";
import { runSentimentFetcher } from "./crons/sentimentFetcher.js";
import { runDailyDigest } from "./crons/dailyDigest.js";
import { runWarehouseExport } from "./crons/warehouseExport.js";
import { runMcpCatalogSync } from "./crons/mcpCatalogSync.js";
import { runEmbeddingBackfill } from "./crons/embeddingBackfill.js";
import { runToolQualityScan } from "./crons/toolQualityScan.js";

const databaseUrl = process.env["DATABASE_URL"];
const redisUrl = process.env["REDIS_URL"];

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!redisUrl) throw new Error("REDIS_URL is required");

const pgClient = postgres(databaseUrl);
const db = drizzle(pgClient);

// Schedule daily embedding backfill at 01:00 UTC (before stats aggregation)
function scheduleEmbeddingBackfillCron(): void {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(1, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[worker] embedding backfill scheduled in ${Math.round(msUntilNext / 60000)}m`);

  setTimeout(() => {
    runEmbeddingBackfill(db).catch(console.error);
    setInterval(() => runEmbeddingBackfill(db).catch(console.error), 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Schedule daily tool-description quality scan at 00:30 UTC (before backfill)
function scheduleToolQualityScanCron(): void {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(0, 30, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[worker] tool quality scan scheduled in ${Math.round(msUntilNext / 60000)}m`);

  setTimeout(() => {
    runToolQualityScan(db).catch(console.error);
    setInterval(() => runToolQualityScan(db).catch(console.error), 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Schedule daily stats aggregator at 02:00 UTC
function scheduleDailyCron(): void {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(2, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[worker] stats aggregator scheduled in ${Math.round(msUntilNext / 60000)}m`);

  setTimeout(() => {
    runStatsAggregator(db).catch(console.error);
    setInterval(() => runStatsAggregator(db).catch(console.error), 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Schedule daily digest webhook at 06:00 UTC
function scheduleDailyDigestCron(): void {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(6, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[worker] daily digest scheduled in ${Math.round(msUntilNext / 60000)}m`);

  setTimeout(() => {
    runDailyDigest(db).catch(console.error);
    setInterval(() => runDailyDigest(db).catch(console.error), 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Schedule warehouse/object-store export at 03:00 UTC
function scheduleWarehouseExportCron(): void {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(3, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[worker] warehouse export scheduled in ${Math.round(msUntilNext / 60000)}m`);

  setTimeout(() => {
    runWarehouseExport(db).catch(console.error);
    setInterval(() => runWarehouseExport(db).catch(console.error), 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Schedule weekly sentiment fetcher on Sunday at 04:00 UTC
function scheduleWeeklyCron(): void {
  const now = new Date();
  const next = new Date(now);
  // Sunday = 0
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
  next.setUTCDate(now.getUTCDate() + daysUntilSunday);
  next.setUTCHours(4, 0, 0, 0);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[worker] sentiment fetcher scheduled in ${Math.round(msUntilNext / 3600000)}h`);

  setTimeout(() => {
    runSentimentFetcher(db).catch(console.error);
    setInterval(() => runSentimentFetcher(db).catch(console.error), 7 * 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Schedule weekly MCP catalog sync on Sunday at 05:00 UTC (after sentiment)
function scheduleCatalogSyncCron(): void {
  const now = new Date();
  const next = new Date(now);
  const daysUntilSunday = (7 - now.getUTCDay()) % 7 || 7;
  next.setUTCDate(now.getUTCDate() + daysUntilSunday);
  next.setUTCHours(5, 0, 0, 0);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(`[worker] mcp catalog sync scheduled in ${Math.round(msUntilNext / 3600000)}h`);

  setTimeout(() => {
    runMcpCatalogSync(db).catch(console.error);
    setInterval(() => runMcpCatalogSync(db).catch(console.error), 7 * 24 * 60 * 60 * 1000);
  }, msUntilNext);
}

// Health check server so Render can run this as a Web Service
const port = process.env["PORT"] ?? "3001";
http
  .createServer((_, res) => {
    res.writeHead(200);
    res.end("ok");
  })
  .listen(port, () => {
    console.log(`[worker] health check listening on port ${port}`);
  });

console.log("[worker] starting background workers");
scheduleToolQualityScanCron();
scheduleEmbeddingBackfillCron();
scheduleDailyCron();
scheduleDailyDigestCron();
scheduleWarehouseExportCron();
scheduleWeeklyCron();
scheduleCatalogSyncCron();

// Graceful shutdown: signal the consumer loop to stop after its current item,
// so a redeploy doesn't SIGKILL the worker mid-transaction. The consumer drains
// its own DB/Redis connections when the loop exits.
let stopping = false;
process.on("SIGTERM", () => {
  console.log("[worker] SIGTERM received — finishing current item then exiting");
  stopping = true;
});
process.on("SIGINT", () => {
  console.log("[worker] SIGINT received — finishing current item then exiting");
  stopping = true;
});
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaughtException:", err);
  stopping = true;
});

// The ingest consumer runs in the main loop until shutdown is signalled.
await startIngestConsumer(redisUrl, databaseUrl, () => stopping);
await pgClient.end({ timeout: 5 }).catch(() => {});
process.exit(0);
