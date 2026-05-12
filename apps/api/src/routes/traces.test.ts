import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middleware/flexAuth.js", () => ({
  flexAuth: vi.fn((req: any, _res: any, next: any) => {
    req.projectId = "proj-1";
    next();
  }),
}));

vi.mock("../middleware/rateLimiter.js", () => ({
  rateLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../db/index.js", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../db/schema.js", () => ({
  traces: {},
  traceSteps: {},
  projects: {},
  organizations: {},
  orgMembers: {},
  users: {},
}));

import { db } from "../db/index.js";
import tracesRouter from "./traces.js";

function makeChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
};

const app = express();
app.use(express.json());
app.use("/v1/traces", tracesRouter);

const traceRow = {
  id: "12345678-1234-4321-8765-123456789abc",
  projectId: "12345678-1234-4321-8765-123456789abd",
  agentId: "agent-1",
  sessionId: "s1",
  userId: "u1",
  env: "prod",
  status: "completed",
  totalLatencyMs: 1200,
  totalTokens: 500,
  totalCostUsd: "0.005",
  metadata: "{}",
  startedAt: new Date("2026-01-01T00:00:00.000Z"),
  endedAt: null,
};

const stepRow = {
  id: "12345678-1234-4321-8765-123456789abe",
  traceId: "12345678-1234-4321-8765-123456789abc",
  stepIndex: 0,
  type: "llm_call",
  name: "gpt-4o",
  input: null,
  output: null,
  latencyMs: 800,
  promptTokens: 300,
  completionTokens: 200,
  totalTokens: 500,
  costUsd: "0.005",
  error: null,
  model: "gpt-4o",
  toolName: null,
  toolVersion: null,
  timestamp: new Date().toISOString(),
};

describe("GET /v1/traces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a list of traces", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([traceRow]));
    const res = await request(app).get("/v1/traces");
    expect(res.status).toBe(200);
    expect(res.body.traces).toHaveLength(1);
    expect(res.body.traces[0]).toMatchObject({
      id: "12345678-1234-4321-8765-123456789abc",
      projectId: "12345678-1234-4321-8765-123456789abd",
      metadata: "{}",
      endedAt: null,
    });
    expect(res.body.traces[0].startedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("returns an empty list when there are no traces", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));
    const res = await request(app).get("/v1/traces");
    expect(res.status).toBe(200);
    expect(res.body.traces).toEqual([]);
  });

  it("returns 400 for an invalid query param", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));
    const res = await request(app).get("/v1/traces?page=invalid");
    expect(res.status).toBe(400);
  });

  it("passes page and limit back in response", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));
    const res = await request(app).get("/v1/traces?page=2&limit=10");
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
  });
});

describe("GET /v1/traces/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the trace with its steps", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([traceRow]))   // trace query
      .mockReturnValueOnce(makeChain([stepRow]));   // steps query
    const res = await request(app).get("/v1/traces/12345678-1234-4321-8765-123456789abc");
    expect(res.status).toBe(200);
    expect(res.body.trace).toMatchObject({
      id: "12345678-1234-4321-8765-123456789abc",
      projectId: "12345678-1234-4321-8765-123456789abd",
      metadata: "{}",
      endedAt: null,
    });
    expect(res.body.steps).toHaveLength(1);
  });

  it("returns 404 when trace does not exist", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));
    const res = await request(app).get("/v1/traces/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("trace_not_found");
  });
});
