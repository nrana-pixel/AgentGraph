import { describe, it, expect, vi } from "vitest";

// These tests lock the PURE scoring math. Mock db/schema/embeddings so importing
// the engine doesn't open a DB connection or reach an embedding provider.
vi.mock("../db/index.js", () => ({ db: { select: vi.fn() } }));
vi.mock("../db/schema.js", () => ({
  tools: {},
  toolGlobalStats: {},
  toolUsageStats: {},
}));
vi.mock("../lib/embeddings.js", () => ({
  embedText: vi.fn().mockResolvedValue(null),
  cosineSimilarity: vi.fn(),
  parseStoredEmbedding: vi.fn(),
}));

import { computeDiscoveryScore, keywordRelevance } from "./discoveryEngine.js";

describe("computeDiscoveryScore", () => {
  it("weights present components and ignores null optionals", () => {
    // Only the always-present components: 80*.35 + 90*.25 + 60*.10, over .70.
    const score = computeDiscoveryScore({
      taskRelevance: 80,
      reliability: 90,
      latency: 60,
      schemaFit: null,
      orgHistory: null,
      isColdStart: false,
    });
    const expected = (80 * 0.35 + 90 * 0.25 + 60 * 0.1) / 0.7;
    expect(score).toBeCloseTo(expected, 5);
  });

  it("a strong org-history signal raises the score (no longer redistributed)", () => {
    const base = computeDiscoveryScore({
      taskRelevance: 50,
      reliability: 50,
      latency: 50,
      schemaFit: null,
      orgHistory: null,
      isColdStart: false,
    });
    const withHistory = computeDiscoveryScore({
      taskRelevance: 50,
      reliability: 50,
      latency: 50,
      schemaFit: null,
      orgHistory: 100,
      isColdStart: false,
    });
    expect(base).toBeCloseTo(50, 5); // all components equal → 50 regardless of weights
    expect(withHistory).toBeGreaterThan(base);
  });

  it("caps cold-start tools at 70 even when every signal is perfect", () => {
    const score = computeDiscoveryScore({
      taskRelevance: 100,
      reliability: 100,
      latency: 100,
      schemaFit: 100,
      orgHistory: 100,
      isColdStart: true,
    });
    expect(score).toBe(70);
  });
});

describe("keywordRelevance", () => {
  it("scores full term overlap at the top of the range", () => {
    // task terms: send, transactional, email — all present in the text.
    expect(
      keywordRelevance("send transactional email", "Transactional email send API service"),
    ).toBe(100);
  });

  it("scores higher as more task terms are found", () => {
    const partial = keywordRelevance("send transactional email", "Email service");
    const full = keywordRelevance("send transactional email", "Transactional email sender");
    expect(full).toBeGreaterThan(partial);
  });

  it("floors a non-match at 20 rather than 0", () => {
    expect(keywordRelevance("send email", "vector database storage")).toBe(20);
  });

  it("returns a neutral 50 when the task has no scorable terms", () => {
    expect(keywordRelevance("a to the", "anything at all here")).toBe(50);
  });
});
