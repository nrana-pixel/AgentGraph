import type { NextFunction, Request, Response } from "express";
import { createHash } from "crypto";
import { redis, RATE_LIMIT_PREFIX } from "../db/redis.js";

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 1_000; // per API key per minute

/**
 * Sliding window rate limiter using Redis sorted sets.
 * Key: agentgraph:rl:<api_key_prefix>
 * Score: timestamp in ms
 * Members: unique request ID (timestamp + random)
 */
export async function rateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  // Bucket per distinct credential. Hashing the full token is required:
  // a fixed-length prefix of a Clerk session JWT is the (identical) JWT
  // header, which would collapse every dashboard user into one shared
  // bucket. We never store the raw token — only its digest.
  const token = authHeader.slice(7);
  const keyId = createHash("sha256").update(token).digest("hex");
  const redisKey = `${RATE_LIMIT_PREFIX}${keyId}`;
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, "-inf", windowStart); // remove old entries
  pipeline.zadd(redisKey, now, member); // add current request
  pipeline.zcard(redisKey); // count requests in window
  pipeline.pexpire(redisKey, WINDOW_MS); // auto-expire the key

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) ?? 0;

  res.setHeader("X-RateLimit-Limit", MAX_REQUESTS);
  res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS - count));
  res.setHeader("X-RateLimit-Reset", Math.ceil((now + WINDOW_MS) / 1000));

  if (count > MAX_REQUESTS) {
    res.status(429).json({
      error: "rate_limit_exceeded",
      retryAfterMs: WINDOW_MS,
    });
    return;
  }

  next();
}
