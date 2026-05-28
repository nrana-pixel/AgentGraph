import { describe, it, expect } from "vitest";
import { computeCost } from "./modelCosts.js";

describe("computeCost", () => {
  it("computes cost for an exact model match", () => {
    // gpt-4o: inputPer1M=2.5, outputPer1M=10.0
    // 500k prompt + 200k completion → 0.5*2.5 + 0.2*10.0 = 3.25
    expect(computeCost("gpt-4o", 500_000, 200_000)).toBeCloseTo(3.25);
  });

  it("returns 0 for zero tokens", () => {
    expect(computeCost("gpt-4o", 0, 0)).toBe(0);
  });

  it("returns null for an unknown model", () => {
    expect(computeCost("totally-unknown-xyz", 1_000, 1_000)).toBeNull();
  });

  it("picks gpt-4o-mini prefix over gpt-4o for versioned names", () => {
    // "gpt-4o-mini-2026-05" must resolve to gpt-4o-mini (0.15/1M) not gpt-4o (2.5/1M)
    expect(computeCost("gpt-4o-mini-2026-05", 1_000_000, 0)).toBeCloseTo(0.15);
  });

  it("picks gpt-4o for an exact suffix that does not match gpt-4o-mini", () => {
    expect(computeCost("gpt-4o", 1_000_000, 0)).toBeCloseTo(2.5);
  });

  it("handles prefix match for claude versioned names", () => {
    // claude-sonnet-4-6 inputPer1M=3.0
    expect(computeCost("claude-sonnet-4-6-20260101", 1_000_000, 0)).toBeCloseTo(3.0);
  });

  it("computes cost using only completion tokens", () => {
    // gpt-4o outputPer1M=10.0
    expect(computeCost("gpt-4o", 0, 1_000_000)).toBeCloseTo(10.0);
  });

  it("mini is cheaper than base gpt-4o for the same token count", () => {
    const mini = computeCost("gpt-4o-mini", 1_000_000, 1_000_000)!;
    const base = computeCost("gpt-4o", 1_000_000, 1_000_000)!;
    expect(mini).toBeLessThan(base);
  });

  it("computes o1 pricing correctly", () => {
    // o1: inputPer1M=15.0, outputPer1M=60.0
    expect(computeCost("o1", 1_000_000, 1_000_000)).toBeCloseTo(75.0);
  });

  it("computes gemini-1.5-flash pricing correctly", () => {
    // inputPer1M=0.075
    expect(computeCost("gemini-1.5-flash", 1_000_000, 0)).toBeCloseTo(0.075);
  });

  it("computes Cohere command-r pricing correctly", () => {
    // command-r: inputPer1M=0.5, outputPer1M=1.5
    // 1M prompt + 1M completion → 0.5 + 1.5 = 2.0
    expect(computeCost("command-r", 1_000_000, 1_000_000)).toBeCloseTo(2.0);
  });

  it("computes Cohere command-r-plus pricing correctly", () => {
    // command-r-plus: inputPer1M=3.0, outputPer1M=15.0
    expect(computeCost("command-r-plus", 1_000_000, 0)).toBeCloseTo(3.0);
  });

  it("does not let command-r shadow command-r-plus for versioned names", () => {
    // "command-r-plus-08-2024" must resolve to command-r-plus (3.0/1M)
    // not command-r (0.5/1M) — exercises the longest-prefix invariant.
    expect(computeCost("command-r-plus-08-2024", 1_000_000, 0)).toBeCloseTo(3.0);
  });

  it("resolves versioned command-r to the base command-r price", () => {
    // "command-r-08-2024" → command-r (0.5/1M)
    expect(computeCost("command-r-08-2024", 1_000_000, 0)).toBeCloseTo(0.5);
  });

  it("picks gpt-4.1-mini prefix over gpt-4.1 for versioned names", () => {
    // "gpt-4.1-mini-2025" must resolve to gpt-4.1-mini (0.4/1M) not gpt-4.1 (2.0/1M)
    expect(computeCost("gpt-4.1-mini-2025", 1_000_000, 0)).toBeCloseTo(0.4);
  });

  it("computes claude-3-haiku pricing correctly", () => {
    // claude-3-haiku-20240307: inputPer1M=0.25, outputPer1M=1.25
    expect(computeCost("claude-3-haiku-20240307", 1_000_000, 1_000_000)).toBeCloseTo(1.5);
  });
});
