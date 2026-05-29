import { describe, it, expect } from "vitest";

// These tests exercise the PURE scoring/schema-fit/projection helpers with
// in-memory inputs. The DB-backed entrypoints (getSwapRecommendations,
// replayToolSwap) are integration-tested elsewhere; here we lock the math.
//
// We still mock db/schema so importing the modules doesn't open a connection.
import { vi } from "vitest";

vi.mock("../db/index.js", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("../db/schema.js", () => ({
  tools: {},
  toolGlobalStats: {},
  toolUsageStats: {},
  traces: {},
  traceSteps: {},
}));

import { computeSchemaFit, scoreSwap, buildSwap } from "./swapRecommendations.js";
import { projectShadowReplay } from "./shadowReplay.js";
import type { ToolUsageRow } from "@agentgraph/types";
import type { CatalogTool } from "./swapRecommendations.js";

describe("computeSchemaFit", () => {
  it("returns null when either schema is null", () => {
    expect(computeSchemaFit(null, "{}")).toBeNull();
    expect(computeSchemaFit("{}", null)).toBeNull();
    expect(computeSchemaFit(null, null)).toBeNull();
  });

  it("returns null when a schema is unparseable (does not throw)", () => {
    expect(computeSchemaFit("{not json", '{"properties":{}}')).toBeNull();
  });

  it("returns 1 for identical property schemas", () => {
    const s = JSON.stringify({
      properties: { query: { type: "string" }, limit: { type: "number" } },
    });
    expect(computeSchemaFit(s, s)).toBe(1);
  });

  it("gives partial credit for shared key with different type", () => {
    const a = JSON.stringify({ properties: { query: { type: "string" } } });
    const b = JSON.stringify({ properties: { query: { type: "number" } } });
    // 1 shared key (0.5 credit, type mismatch) / 1 union key = 0.5
    expect(computeSchemaFit(a, b)).toBe(0.5);
  });

  it("scores by fraction of shared keys over the union", () => {
    const a = JSON.stringify({
      properties: { query: { type: "string" }, limit: { type: "number" } },
    });
    const b = JSON.stringify({
      properties: { query: { type: "string" }, offset: { type: "number" } },
    });
    // matched: query=1; union {query, limit, offset}=3 → 1/3
    expect(computeSchemaFit(a, b)).toBeCloseTo(1 / 3, 5);
  });

  it("falls back to root keys when there is no `properties`", () => {
    const a = JSON.stringify({ query: { type: "string" } });
    const b = JSON.stringify({ query: { type: "string" } });
    expect(computeSchemaFit(a, b)).toBe(1);
  });

  it("returns 0 when one side has keys and the other is empty", () => {
    const a = JSON.stringify({ properties: { query: { type: "string" } } });
    const b = JSON.stringify({ properties: {} });
    expect(computeSchemaFit(a, b)).toBe(0);
  });
});

describe("scoreSwap", () => {
  it("returns ~50 (parity) when candidate matches current and no schema/latency info", () => {
    const score = scoreSwap({
      currentP95: null,
      currentErrorRate: 0.1,
      candidateP95: null,
      candidateSuccessRate: 0.9, // = 1 - 0.1
      candidatePopularity: 50,
      schemaFit: null,
    });
    expect(score).toBeCloseTo(50, 0);
  });

  it("scores a more reliable + faster candidate above parity", () => {
    const better = scoreSwap({
      currentP95: 1000,
      currentErrorRate: 0.2,
      candidateP95: 400,
      candidateSuccessRate: 0.99,
      candidatePopularity: 90,
      schemaFit: null,
    });
    expect(better).toBeGreaterThan(50);
  });

  it("scores a worse candidate below parity", () => {
    const worse = scoreSwap({
      currentP95: 300,
      currentErrorRate: 0.01,
      candidateP95: 2000,
      candidateSuccessRate: 0.7,
      candidatePopularity: 20,
      schemaFit: null,
    });
    expect(worse).toBeLessThan(50);
  });

  it("redistributes schema weight when fit is unknown (null) vs present", () => {
    const base = {
      currentP95: 1000,
      currentErrorRate: 0.2,
      candidateP95: 400,
      candidateSuccessRate: 0.99,
      candidatePopularity: 90,
    };
    const unknown = scoreSwap({ ...base, schemaFit: null });
    const perfectFit = scoreSwap({ ...base, schemaFit: 1 });
    const poorFit = scoreSwap({ ...base, schemaFit: 0 });
    // A perfect schema fit should not lower the score vs unknown; a poor fit should.
    expect(perfectFit).toBeGreaterThanOrEqual(unknown);
    expect(poorFit).toBeLessThan(unknown);
  });

  it("clamps within 0–100", () => {
    const s = scoreSwap({
      currentP95: 5000,
      currentErrorRate: 0.99,
      candidateP95: 1,
      candidateSuccessRate: 1,
      candidatePopularity: 100,
      schemaFit: 1,
    });
    expect(s).toBeLessThanOrEqual(100);
    expect(s).toBeGreaterThanOrEqual(0);
  });
});

function makeUsage(overrides: Partial<ToolUsageRow> = {}): ToolUsageRow {
  return {
    toolSlug: "slow-search",
    calls: 100,
    errorCount: 20,
    errorRate: 0.2,
    avgLatencyMs: 900,
    p50LatencyMs: 800,
    p95LatencyMs: 1500,
    totalCostUsd: 5,
    inCatalog: true,
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CatalogTool> = {}): CatalogTool {
  return {
    slug: "fast-search",
    name: "Fast Search",
    category: "search",
    inputSchema: null,
    outputSchema: null,
    successRate: 0.98,
    p95LatencyMs: 400,
    popularityScore: 85,
    ...overrides,
  };
}

describe("buildSwap", () => {
  it("produces signed deltas with correct direction flags", () => {
    const swap = buildSwap(makeUsage(), makeCandidate());
    expect(swap.currentTool).toBe("slow-search");
    expect(swap.suggestedTool).toBe("fast-search");
    // latency: suggested 400 - current 1500 = -1100 (improvement, betterIsLower)
    expect(swap.latency.delta).toBe(-1100);
    expect(swap.latency.betterIsLower).toBe(true);
    // reliability: current success 0.8, candidate 0.98 → +0.18 (betterIsLower=false)
    expect(swap.reliability.current).toBeCloseTo(0.8, 5);
    expect(swap.reliability.suggested).toBe(0.98);
    expect(swap.reliability.betterIsLower).toBe(false);
    expect(swap.score).toBeGreaterThan(50);
  });

  it("reports per-call observed cost as current, projected cost null", () => {
    const swap = buildSwap(makeUsage({ totalCostUsd: 10, calls: 100 }), makeCandidate());
    expect(swap.cost.current).toBeCloseTo(0.1, 5); // 10 / 100
    expect(swap.cost.suggested).toBeNull();
    expect(swap.cost.delta).toBeNull();
  });

  it("mentions higher success rate and lower latency in the reason", () => {
    const swap = buildSwap(makeUsage(), makeCandidate());
    expect(swap.reason).toMatch(/success rate/i);
    expect(swap.reason).toMatch(/latency/i);
  });

  it("sets schemaFit null when the current tool's schemas are unknown", () => {
    // candidate has schemas, but current (default) does not → nothing to compare
    const swap = buildSwap(
      makeUsage(),
      makeCandidate({ inputSchema: '{"properties":{"q":{"type":"string"}}}', outputSchema: null }),
    );
    expect(swap.schemaFit).toBeNull();
  });

  it("computes schemaFit by comparing CURRENT vs CANDIDATE input schemas", () => {
    const inputSchema = '{"properties":{"query":{"type":"string"}}}';
    const swap = buildSwap(
      makeUsage(),
      makeCandidate({ inputSchema, outputSchema: null }),
      { inputSchema, outputSchema: null },
    );
    // identical current+candidate input schemas → perfect input fit
    expect(swap.schemaFit).toBe(1);
  });

  it("averages input and output fit when both sides have both", () => {
    const current = {
      inputSchema: '{"properties":{"q":{"type":"string"}}}',
      outputSchema: '{"properties":{"a":{"type":"string"},"b":{"type":"number"}}}',
    };
    const swap = buildSwap(
      makeUsage(),
      makeCandidate({
        inputSchema: '{"properties":{"q":{"type":"string"}}}', // input fit = 1
        outputSchema: '{"properties":{"a":{"type":"string"}}}', // output fit = 1/2 (a shared / {a,b} union)
      }),
      current,
    );
    // (1 + 0.5) / 2 = 0.75
    expect(swap.schemaFit).toBeCloseTo(0.75, 5);
  });
});

describe("projectShadowReplay", () => {
  it("projects latency/error from candidate stats and leaves cost null", () => {
    const result = projectShadowReplay(
      {
        calls: 100,
        errorCount: 20,
        p50LatencyMs: 800,
        p95LatencyMs: 1500,
        totalCostUsd: 12,
      },
      { successRate: 0.99, avgLatencyMs: 200, p95LatencyMs: 400 },
    );
    expect(result.callsAnalyzed).toBe(100);
    // observed error rate 0.2, projected 1 - 0.99 = 0.01
    expect(result.errorRate.observed).toBeCloseTo(0.2, 5);
    expect(result.errorRate.projected).toBeCloseTo(0.01, 5);
    // p95: observed 1500, projected 400, net improvement = 1100
    expect(result.p95LatencyMs.projected).toBe(400);
    expect(result.netLatencyImprovementMs).toBe(1100);
    // cost: observed shown, projected null
    expect(result.costUsd.observed).toBe(12);
    expect(result.costUsd.projected).toBeNull();
  });

  it("returns null projections and notes when candidate has no benchmark", () => {
    const result = projectShadowReplay(
      { calls: 10, errorCount: 1, p50LatencyMs: 100, p95LatencyMs: 200, totalCostUsd: 1 },
      { successRate: null, avgLatencyMs: null, p95LatencyMs: null },
    );
    expect(result.p95LatencyMs.projected).toBeNull();
    expect(result.errorRate.projected).toBeNull();
    expect(result.netLatencyImprovementMs).toBeNull();
    expect(result.notes.some((n) => /unavailable/i.test(n))).toBe(true);
  });

  it("handles zero observed calls without dividing by zero", () => {
    const result = projectShadowReplay(
      { calls: 0, errorCount: 0, p50LatencyMs: null, p95LatencyMs: null, totalCostUsd: null },
      { successRate: 0.95, avgLatencyMs: 300, p95LatencyMs: 500 },
    );
    expect(result.callsAnalyzed).toBe(0);
    expect(result.errorRate.observed).toBeNull();
    expect(result.netLatencyImprovementMs).toBeNull();
  });

  it("always documents the projection as an estimate and cost as unprojectable", () => {
    const result = projectShadowReplay(
      { calls: 5, errorCount: 0, p50LatencyMs: 100, p95LatencyMs: 150, totalCostUsd: 2 },
      { successRate: 0.9, avgLatencyMs: 120, p95LatencyMs: 180 },
    );
    expect(result.notes.some((n) => /estimate/i.test(n))).toBe(true);
    expect(result.notes.some((n) => /cost cannot be projected/i.test(n))).toBe(true);
  });
});
