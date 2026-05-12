import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../middleware/apiKeyAuth.js", () => ({
  apiKeyAuth: vi.fn((req: any, _res: any, next: any) => {
    req.projectId = "proj-1";
    req.orgId = "org-1";
    req.orgPlan = "pro";
    next();
  }),
}));

vi.mock("../middleware/rateLimiter.js", () => ({
  rateLimiter: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../db/index.js", () => ({
  db: { select: vi.fn(), update: vi.fn() },
}));

vi.mock("../db/schema.js", () => ({
  organizations: {},
  projects: {},
}));

vi.mock("../db/redis.js", () => ({
  redis: { lpush: vi.fn().mockResolvedValue(1) },
  INGEST_QUEUE_KEY: "agentgraph:ingest:queue",
}));

import { db } from "../db/index.js";
import { redis } from "../db/redis.js";
import ingestRouter from "./ingest.js";

function makeChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    catch: vi.fn(),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const app = express();
app.use(express.json());
app.use("/v1/ingest", ingestRouter);

const validStep = {
  type: "llm_call",
  name: "gpt-4o call",
  timestamp: new Date().toISOString(),
};

const validPayload = {
  agentId: "agent-1",
  steps: [validStep],
};

describe("POST /v1/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockReturnValue(
      makeChain([{ plan: "pro", tracesUsed: 0 }]),
    );
    vi.mocked(db.update).mockReturnValue(makeChain([]));
  });

  it("returns 200 with traceId and stepsQueued for a valid payload", async () => {
    const res = await request(app).post("/v1/ingest").send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("queued");
    expect(res.body.stepsQueued).toBe(1);
    expect(res.body.traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("preserves a caller-supplied traceId", async () => {
    const traceId = "12345678-1234-4321-8765-123456789abc";
    const res = await request(app)
      .post("/v1/ingest")
      .send({ ...validPayload, traceId });
    expect(res.status).toBe(200);
    expect(res.body.traceId).toBe(traceId);
  });

  it("pushes the payload to Redis", async () => {
    await request(app).post("/v1/ingest").send(validPayload);
    expect(redis.lpush).toHaveBeenCalledOnce();
  });

  it("returns 400 when agentId is missing", async () => {
    const res = await request(app)
      .post("/v1/ingest")
      .send({ steps: [validStep] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation_error");
  });

  it("returns 400 when steps array is empty", async () => {
    const res = await request(app)
      .post("/v1/ingest")
      .send({ agentId: "agent-1", steps: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 when a step has an invalid type", async () => {
    const res = await request(app).post("/v1/ingest").send({
      agentId: "agent-1",
      steps: [{ type: "invalid_type", name: "test", timestamp: new Date().toISOString() }],
    });
    expect(res.status).toBe(400);
  });

  it("returns 402 when the org has hit its trace limit", async () => {
    vi.mocked(db.select).mockReturnValue(
      makeChain([{ plan: "free", tracesUsed: 10_000 }]),
    );
    const res = await request(app).post("/v1/ingest").send(validPayload);
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("trace_limit_exceeded");
  });

  it("returns 401 when the project is not found", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([]));
    const res = await request(app).post("/v1/ingest").send(validPayload);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("project_not_found");
  });

  it("counts steps correctly when multiple steps are sent", async () => {
    const steps = [validStep, { ...validStep, name: "tool call" }, { ...validStep, name: "retrieval", type: "retrieval" }];
    const res = await request(app)
      .post("/v1/ingest")
      .send({ agentId: "agent-1", steps });
    expect(res.status).toBe(200);
    expect(res.body.stepsQueued).toBe(3);
  });
});
