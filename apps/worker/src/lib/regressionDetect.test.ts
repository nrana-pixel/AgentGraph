import { describe, it, expect } from "vitest";
import {
  detectRegressions,
  type ToolSnapshot,
} from "./regressionDetect.js";

// 7 stable trailing days: 97% success, 600ms p95, $0.01/call.
const stableHistory: ToolSnapshot[] = Array.from({ length: 7 }, () => ({
  successRate: 0.97,
  p95LatencyMs: 600,
  costPerCallUsd: 0.01,
  totalCalls: 200,
}));

const healthyCurrent: ToolSnapshot = {
  successRate: 0.97,
  p95LatencyMs: 610,
  costPerCallUsd: 0.0102,
  totalCalls: 200,
};

describe("detectRegressions", () => {
  it("returns nothing when the tool is stable", () => {
    expect(detectRegressions(healthyCurrent, stableHistory)).toEqual([]);
  });

  it("flags a success-rate drop ≥ 8 points", () => {
    const current: ToolSnapshot = { ...healthyCurrent, successRate: 0.86 };
    const out = detectRegressions(current, stableHistory);
    expect(out.map((r) => r.kind)).toContain("success_rate");
    const r = out.find((x) => x.kind === "success_rate")!;
    expect(r.baseline.successRate).toBeCloseTo(0.97);
    expect(r.current.successRate).toBeCloseTo(0.86);
  });

  it("does not flag a sub-threshold success-rate dip", () => {
    const current: ToolSnapshot = { ...healthyCurrent, successRate: 0.92 }; // 5 pts
    expect(detectRegressions(current, stableHistory)).toEqual([]);
  });

  it("flags a p95 latency rise ≥ 50%", () => {
    const current: ToolSnapshot = { ...healthyCurrent, p95LatencyMs: 950 };
    expect(detectRegressions(current, stableHistory).map((r) => r.kind)).toContain(
      "latency",
    );
  });

  it("flags a cost-per-call rise ≥ 50%", () => {
    const current: ToolSnapshot = { ...healthyCurrent, costPerCallUsd: 0.016 };
    expect(detectRegressions(current, stableHistory).map((r) => r.kind)).toContain(
      "cost",
    );
  });

  it("suppresses alerts below the sample guardrail", () => {
    const current: ToolSnapshot = {
      ...healthyCurrent,
      successRate: 0.5,
      totalCalls: 10,
    };
    expect(detectRegressions(current, stableHistory)).toEqual([]);
  });

  it("does nothing with no history", () => {
    const current: ToolSnapshot = { ...healthyCurrent, successRate: 0.5 };
    expect(detectRegressions(current, [])).toEqual([]);
  });

  it("emits rug_pull when the definition changed AND performance regressed", () => {
    const current: ToolSnapshot = { ...healthyCurrent, successRate: 0.85 };
    const out = detectRegressions(current, stableHistory, {
      definitionChanged: true,
    });
    expect(out.map((r) => r.kind)).toContain("rug_pull");
    expect(out.map((r) => r.kind)).toContain("success_rate");
  });

  it("does NOT emit rug_pull when the definition changed but nothing regressed", () => {
    const out = detectRegressions(healthyCurrent, stableHistory, {
      definitionChanged: true,
    });
    expect(out).toEqual([]);
  });
});
