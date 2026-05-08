import { Redis } from "ioredis";

const redisUrl = process.env["REDIS_URL"];
if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on("error", (err: Error) => {
  console.error("[redis] connection error:", err);
});

redis.on("connect", () => {
  console.log("[redis] connected");
});

export const INGEST_QUEUE_KEY = "agentgraph:ingest:queue";
export const RATE_LIMIT_PREFIX = "agentgraph:rl:";
export const RECOMMEND_CACHE_PREFIX = "agentgraph:rec:";
