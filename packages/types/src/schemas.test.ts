import { describe, it, expect } from "vitest";
import {
  IngestPayloadSchema,
  TraceStepInputSchema,
  TokenUsageSchema,
  TraceListFilterSchema,
} from "./index.js";

const validStep = {
  type: "llm_call" as const,
  name: "gpt-4o inference",
  timestamp: new Date().toISOString(),
};

const validPayload = {
  agentId: "my-agent",
  steps: [validStep],
};

describe("IngestPayloadSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(IngestPayloadSchema.safeParse(validPayload).success).toBe(true);
  });

  it("defaults env to prod when omitted", () => {
    const result = IngestPayloadSchema.safeParse(validPayload);
    expect(result.success && result.data.env).toBe("prod");
  });

  it("defaults status to completed when omitted", () => {
    const result = IngestPayloadSchema.safeParse(validPayload);
    expect(result.success && result.data.status).toBe("completed");
  });

  it("rejects when agentId is missing", () => {
    expect(IngestPayloadSchema.safeParse({ steps: [validStep] }).success).toBe(false);
  });

  it("rejects when steps is empty", () => {
    expect(
      IngestPayloadSchema.safeParse({ agentId: "a", steps: [] }).success,
    ).toBe(false);
  });

  it("rejects more than 500 steps", () => {
    const steps = Array.from({ length: 501 }, () => validStep);
    expect(IngestPayloadSchema.safeParse({ agentId: "a", steps }).success).toBe(false);
  });

  it("accepts optional traceId as a UUID", () => {
    const result = IngestPayloadSchema.safeParse({
      ...validPayload,
      traceId: "12345678-1234-4321-8765-123456789abc",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID traceId", () => {
    expect(
      IngestPayloadSchema.safeParse({ ...validPayload, traceId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("accepts all valid env values", () => {
    for (const env of ["prod", "dev", "staging"] as const) {
      expect(IngestPayloadSchema.safeParse({ ...validPayload, env }).success).toBe(true);
    }
  });

  it("rejects unknown env values", () => {
    expect(
      IngestPayloadSchema.safeParse({ ...validPayload, env: "production" }).success,
    ).toBe(false);
  });

  it("rejects negative totalCostUsd", () => {
    expect(
      IngestPayloadSchema.safeParse({ ...validPayload, totalCostUsd: -1 }).success,
    ).toBe(false);
  });

  it("rejects negative totalLatencyMs", () => {
    expect(
      IngestPayloadSchema.safeParse({ ...validPayload, totalLatencyMs: -1 }).success,
    ).toBe(false);
  });
});

describe("TraceStepInputSchema", () => {
  it("accepts a minimal valid step", () => {
    expect(TraceStepInputSchema.safeParse(validStep).success).toBe(true);
  });

  it("rejects unknown step types", () => {
    expect(
      TraceStepInputSchema.safeParse({ ...validStep, type: "database_call" }).success,
    ).toBe(false);
  });

  it("accepts all valid step types", () => {
    for (const type of ["llm_call", "tool_call", "retrieval", "human", "custom"] as const) {
      expect(TraceStepInputSchema.safeParse({ ...validStep, type }).success).toBe(true);
    }
  });

  it("rejects an empty name", () => {
    expect(TraceStepInputSchema.safeParse({ ...validStep, name: "" }).success).toBe(false);
  });

  it("rejects a name longer than 200 chars", () => {
    expect(
      TraceStepInputSchema.safeParse({ ...validStep, name: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects negative latencyMs", () => {
    expect(
      TraceStepInputSchema.safeParse({ ...validStep, latencyMs: -1 }).success,
    ).toBe(false);
  });

  it("rejects a non-datetime timestamp", () => {
    expect(
      TraceStepInputSchema.safeParse({ ...validStep, timestamp: "not-a-date" }).success,
    ).toBe(false);
  });

  it("accepts optional input/output as records", () => {
    const result = TraceStepInputSchema.safeParse({
      ...validStep,
      input: { query: "hello" },
      output: { response: "world" },
    });
    expect(result.success).toBe(true);
  });
});

describe("TokenUsageSchema", () => {
  it("accepts valid token counts", () => {
    expect(
      TokenUsageSchema.safeParse({ prompt: 100, completion: 50, total: 150 }).success,
    ).toBe(true);
  });

  it("rejects negative prompt tokens", () => {
    expect(
      TokenUsageSchema.safeParse({ prompt: -1, completion: 0, total: 0 }).success,
    ).toBe(false);
  });

  it("rejects fractional token counts", () => {
    expect(
      TokenUsageSchema.safeParse({ prompt: 1.5, completion: 0, total: 1 }).success,
    ).toBe(false);
  });
});

describe("TraceListFilterSchema", () => {
  it("defaults page to 1 and limit to 50", () => {
    const result = TraceListFilterSchema.safeParse({});
    expect(result.success && result.data.page).toBe(1);
    expect(result.success && result.data.limit).toBe(50);
  });

  it("rejects page=0", () => {
    // page values come as strings from query params
    expect(TraceListFilterSchema.safeParse({ page: "0" }).success).toBe(false);
  });

  it("rejects limit above 100", () => {
    expect(TraceListFilterSchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("accepts optional filter fields", () => {
    const result = TraceListFilterSchema.safeParse({
      agentId: "agent-1",
      status: "completed",
      sessionId: "s1",
      userId: "u1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    expect(TraceListFilterSchema.safeParse({ status: "pending" }).success).toBe(false);
  });
});
