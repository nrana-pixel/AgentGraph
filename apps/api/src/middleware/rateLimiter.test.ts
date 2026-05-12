import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

const mockPipeline = {
  zremrangebyscore: vi.fn().mockReturnThis(),
  zadd: vi.fn().mockReturnThis(),
  zcard: vi.fn().mockReturnThis(),
  pexpire: vi.fn().mockReturnThis(),
  exec: vi.fn(),
};

vi.mock("../db/redis.js", () => ({
  redis: { pipeline: vi.fn(() => mockPipeline) },
  RATE_LIMIT_PREFIX: "agentgraph:rl:",
}));

import { rateLimiter } from "./rateLimiter.js";

function makeReqRes(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
  } as Request;
  const res = {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  return { req, res };
}

const next = vi.fn() as unknown as NextFunction;

describe("rateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips rate limiting when Authorization header is absent", async () => {
    const { req, res } = makeReqRes();
    await rateLimiter(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(mockPipeline.exec).not.toHaveBeenCalled();
  });

  it("calls next when request count is under the limit", async () => {
    // [zrem result, zadd result, zcard=5, pexpire result]
    mockPipeline.exec.mockResolvedValue([[null, 0], [null, 1], [null, 5], [null, 1]]);
    const { req, res } = makeReqRes("Bearer ag_live_testkey12345");
    await rateLimiter(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 1000);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 995);
  });

  it("returns 429 when request count exceeds the limit", async () => {
    // zcard returns 1001 (over limit)
    mockPipeline.exec.mockResolvedValue([[null, 0], [null, 1], [null, 1001], [null, 1]]);
    const { req, res } = makeReqRes("Bearer ag_live_spamkey12345");
    await rateLimiter(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "rate_limit_exceeded" }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("sets X-RateLimit-Remaining to 0 when over limit", async () => {
    mockPipeline.exec.mockResolvedValue([[null, 0], [null, 1], [null, 1500], [null, 1]]);
    const { req, res } = makeReqRes("Bearer ag_live_over9000xxxx");
    await rateLimiter(req, res, next);
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 0);
  });

  it("includes retryAfterMs in the 429 body", async () => {
    mockPipeline.exec.mockResolvedValue([[null, 0], [null, 1], [null, 1001], [null, 1]]);
    const { req, res } = makeReqRes("Bearer ag_live_spamkey99999");
    await rateLimiter(req, res, next);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.retryAfterMs).toBe(60_000);
  });
});
