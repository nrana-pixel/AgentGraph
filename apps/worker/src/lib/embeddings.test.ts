import { describe, it, expect, vi, afterEach } from "vitest";
import { embedTexts, toolEmbeddingText } from "./embeddings.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("toolEmbeddingText", () => {
  it("joins name, description and tags", () => {
    expect(toolEmbeddingText("Stripe", "Payments API", ["billing", "cards"])).toBe(
      "Stripe Payments API billing cards",
    );
  });
  it("tolerates a null description and empty tags", () => {
    expect(toolEmbeddingText("Foo", null, [])).toBe("Foo");
  });
});

describe("embedTexts", () => {
  it("returns index-aligned nulls when no provider is configured", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(await embedTexts(["a", "b"])).toEqual([null, null]);
  });

  it("maps provider vectors back to original indices, skipping blanks", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "test-key");
    // Inputs has a blank in the middle: only "a" and "b" are sent, as provider
    // indices 0 and 1, which must map back to original indices 0 and 2.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [1, 2] },
          { index: 1, embedding: [3, 4] },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await embedTexts(["a", "   ", "b"]);
    expect(out).toEqual([[1, 2], null, [3, 4]]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("yields nulls for a failed batch without throwing", async () => {
    vi.stubEnv("EMBEDDING_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "err" }));
    expect(await embedTexts(["a", "b"])).toEqual([null, null]);
  });
});
