import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/index.js", () => ({
  db: { select: vi.fn() },
}));

vi.mock("../db/schema.js", () => ({
  tools: {},
  toolGlobalStats: {},
}));

import { db } from "../db/index.js";
import { getRecommendations } from "./recommendationEngine.js";

function makeChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function makeTool(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "tool-1",
    slug: "openai",
    name: "OpenAI",
    description: "LLM API for building AI applications",
    category: "llm",
    website: "https://openai.com",
    docsUrl: null,
    isOpenSource: false,
    isSelfHostable: false,
    pricingModel: "usage",
    dataResidency: [],
    tags: ["llm", "ai"],
    dataSource: "telemetry",
    sentimentScore: "75",
    totalCalls: 200,
    successRate: "0.95",
    avgLatencyMs: "300",
    p95LatencyMs: "600",
    popularityScore: "80",
    lastUpdated: new Date(),
    ...overrides,
  };
}

describe("getRecommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns recommendations with correct shape", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([makeTool()]));

    const result = await getRecommendations({ task: "send email", limit: 5 });

    expect(result.task).toBe("send email");
    expect(result.recommendations).toHaveLength(1);
    const rec = result.recommendations[0]!;
    expect(rec.slug).toBe("openai");
    expect(rec.score).toBeGreaterThan(0);
    expect(typeof rec.reason).toBe("string");
  });

  it("scores a high-success-rate tool above 70", async () => {
    const tool = makeTool({ successRate: "0.99", totalCalls: 500 });
    vi.mocked(db.select).mockReturnValue(makeChain([tool]));

    const { recommendations } = await getRecommendations({ task: "llm inference", limit: 1 });
    expect(recommendations[0]!.score).toBeGreaterThan(70);
  });

  it("caps cold-start tools at score 70", async () => {
    // totalCalls < 50 triggers cold start
    const tool = makeTool({ totalCalls: 10, successRate: "0.99", popularityScore: "99", sentimentScore: "99" });
    vi.mocked(db.select).mockReturnValue(makeChain([tool]));

    const { recommendations } = await getRecommendations({ task: "anything", limit: 1 });
    expect(recommendations[0]!.score).toBeLessThanOrEqual(70);
    expect(recommendations[0]!.dataSource).toBe("seeded");
  });

  it("marks non-cold-start tools with telemetry dataSource", async () => {
    const tool = makeTool({ totalCalls: 200, dataSource: "telemetry" });
    vi.mocked(db.select).mockReturnValue(makeChain([tool]));

    const { recommendations } = await getRecommendations({ task: "anything", limit: 1 });
    expect(recommendations[0]!.dataSource).toBe("telemetry");
  });

  it("sorts results by score descending", async () => {
    const highScore = makeTool({ slug: "fast-tool", successRate: "0.99", popularityScore: "90", totalCalls: 200 });
    const lowScore = makeTool({ slug: "slow-tool", successRate: "0.50", popularityScore: "10", totalCalls: 200 });
    vi.mocked(db.select).mockReturnValue(makeChain([lowScore, highScore]));

    const { recommendations } = await getRecommendations({ task: "fast inference", limit: 10 });
    expect(recommendations[0]!.slug).toBe("fast-tool");
    expect(recommendations[0]!.score).toBeGreaterThan(recommendations[1]!.score);
  });

  it("falls back to second DB query when FTS returns no results", async () => {
    // First call (FTS) returns empty, second (fallback) returns a tool
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([makeTool()]));

    const { recommendations } = await getRecommendations({ task: "obscure query xyz", limit: 5 });
    expect(recommendations).toHaveLength(1);
  });

  it("returns empty recommendations when both queries return nothing", async () => {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([]));

    const { recommendations } = await getRecommendations({ task: "nothing matches", limit: 5 });
    expect(recommendations).toHaveLength(0);
  });

  it("includes reason mentioning high success rate", async () => {
    const tool = makeTool({ successRate: "0.98", totalCalls: 200 });
    vi.mocked(db.select).mockReturnValue(makeChain([tool]));

    const { recommendations } = await getRecommendations({ task: "reliable llm", limit: 1 });
    expect(recommendations[0]!.reason).toMatch(/success rate|reliability/i);
  });

  it("includes low latency in reason when p95 < 500ms", async () => {
    const tool = makeTool({ p95LatencyMs: "200", totalCalls: 200 });
    vi.mocked(db.select).mockReturnValue(makeChain([tool]));

    const { recommendations } = await getRecommendations({ task: "fast tool", limit: 1 });
    expect(recommendations[0]!.reason).toContain("low latency");
  });

  it("respects the limit parameter", async () => {
    const tools = Array.from({ length: 10 }, (_, i) =>
      makeTool({ id: `t-${i}`, slug: `tool-${i}`, totalCalls: 200 }),
    );
    vi.mocked(db.select).mockReturnValue(makeChain(tools));

    const { recommendations } = await getRecommendations({ task: "any", limit: 3 });
    expect(recommendations).toHaveLength(3);
  });

  it("includes dataFreshness as an ISO date string", async () => {
    vi.mocked(db.select).mockReturnValue(makeChain([makeTool()]));

    const { dataFreshness } = await getRecommendations({ task: "any", limit: 5 });
    expect(() => new Date(dataFreshness)).not.toThrow();
    expect(dataFreshness).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
