import { describe, it, expect } from "vitest";
import {
  computeReliabilityScore,
  latencyScore,
  adoptionScore,
  gradeBand,
  type ReliabilityInputs,
} from "./reliabilityScore.js";

const base: ReliabilityInputs = {
  successRate: 0.99,
  p95LatencyMs: 500,
  categoryP95Median: 500,
  consistency: 1,
  distinctOrgs: 50,
  totalCalls: 1000,
};

describe("latencyScore", () => {
  it("scores 50 at the category median p95", () => {
    expect(latencyScore(500, 500)).toBe(50);
  });

  it("rewards faster-than-median latency", () => {
    expect(latencyScore(100, 500)).toBeGreaterThan(50);
  });

  it("clamps to 0 for very slow tools", () => {
    expect(latencyScore(10_000, 500)).toBe(0);
  });

  it("clamps to 100 for instant tools", () => {
    expect(latencyScore(0, 500)).toBe(100);
  });

  it("returns a neutral 50 when no category baseline exists", () => {
    expect(latencyScore(500, 0)).toBe(50);
  });
});

describe("adoptionScore", () => {
  it("is 0 with no orgs", () => {
    expect(adoptionScore(0)).toBe(0);
  });

  it("saturates near 100 at the saturation point", () => {
    expect(adoptionScore(50)).toBeCloseTo(100, 0);
  });

  it("is monotonic in distinctOrgs", () => {
    expect(adoptionScore(10)).toBeGreaterThan(adoptionScore(3));
  });
});

describe("computeReliabilityScore", () => {
  it("gives a near-perfect, faster-than-median tool an A-grade score", () => {
    // base sits AT the category median latency (latency term = 50). A tool that
    // is also faster than its peers should clear 90.
    const score = computeReliabilityScore({ ...base, p95LatencyMs: 100 });
    expect(score).toBeGreaterThanOrEqual(90);
    expect(gradeBand(score)).toBe("A");
  });

  it("scores a solid-but-median tool in the high B range", () => {
    expect(computeReliabilityScore(base)).toBeGreaterThanOrEqual(85);
  });

  it("applies the cold-start cap below 50 calls", () => {
    const score = computeReliabilityScore({ ...base, totalCalls: 10 });
    expect(score).toBeLessThanOrEqual(70);
  });

  it("does not cap once 50+ calls accumulate", () => {
    const score = computeReliabilityScore({ ...base, totalCalls: 50 });
    expect(score).toBeGreaterThan(70);
  });

  it("penalises high latency", () => {
    const fast = computeReliabilityScore(base);
    const slow = computeReliabilityScore({ ...base, p95LatencyMs: 5000 });
    expect(slow).toBeLessThan(fast);
  });

  it("penalises low success rate", () => {
    const good = computeReliabilityScore(base);
    const bad = computeReliabilityScore({ ...base, successRate: 0.5 });
    expect(bad).toBeLessThan(good);
  });

  it("penalises inconsistency", () => {
    const stable = computeReliabilityScore(base);
    const jumpy = computeReliabilityScore({ ...base, consistency: 0 });
    expect(jumpy).toBeLessThan(stable);
  });

  it("stays within 0..100", () => {
    const worst = computeReliabilityScore({
      successRate: 0,
      p95LatencyMs: 99_999,
      categoryP95Median: 100,
      consistency: 0,
      distinctOrgs: 0,
      totalCalls: 1000,
    });
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThanOrEqual(100);
  });
});

describe("gradeBand", () => {
  it("maps score ranges to letter grades", () => {
    expect(gradeBand(95)).toBe("A");
    expect(gradeBand(90)).toBe("A");
    expect(gradeBand(80)).toBe("B");
    expect(gradeBand(75)).toBe("B");
    expect(gradeBand(65)).toBe("C");
    expect(gradeBand(60)).toBe("C");
    expect(gradeBand(45)).toBe("D");
    expect(gradeBand(40)).toBe("D");
    expect(gradeBand(20)).toBe("F");
    expect(gradeBand(0)).toBe("F");
  });
});
