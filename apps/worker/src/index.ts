import "dotenv/config";
import http from "node:http";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { startIngestConsumer } from "./consumers/ingestConsumer.js";
import { runStatsAggregator } from "./crons/statsAggregator.js";
import { runSentimentFetcher } from "./crons/sentimentFetcher.js";
import { runDailyDigest } from "./crons/dailyDigest.js";
import { runWarehouseExport } from "./crons/warehouseExport.js";

const databaseUrl = process.env["DATABASE_URL"];
const redisUrl = process.env["REDIS_URL"];

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!redisUrl) throw new Error("REDIS_URL is required");

const pgClient = postgres(databaseUrl);
const db = drizzle(pgClient);

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

// Health check server so Render can run this as a Web Service
const port = process.env["PORT"] ?? "3001";
http.createServer((_, res) => {
  res.writeHead(200);
  res.end("ok");
}).listen(port, () => {
  console.log(`[worker] health check listening on port ${port}`);
});

console.log("[worker] starting background workers");
scheduleDailyCron();
scheduleDailyDigestCron();
scheduleWarehouseExportCron();
scheduleWeeklyCron();

// The ingest consumer runs indefinitely in the main loop
await startIngestConsumer(redisUrl, databaseUrl);
