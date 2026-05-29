// Worker-side text embedding (mirror of apps/api/src/lib/embeddings.ts — this
// repo intentionally duplicates small libs across api/worker rather than sharing
// a package). Used by catalog sync to populate tools.embedding. Returns null
// when unconfigured so discovery falls back to keyword/FTS relevance.

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";

function apiKey(): string | null {
  return process.env["EMBEDDING_API_KEY"] ?? process.env["OPENAI_API_KEY"] ?? null;
}

export function embeddingsEnabled(): boolean {
  return apiKey() !== null;
}

export async function embedText(text: string): Promise<number[] | null> {
  const [vec] = await embedTexts([text]);
  return vec ?? null;
}

// Max inputs per provider request. OpenAI allows up to 2048; we keep batches
// conservative to bound payload size and per-request token limits.
const BATCH_SIZE = 96;

/**
 * Embed many strings, batching provider calls. Returns one vector (or null) per
 * input, index-aligned. A whole-batch failure yields nulls for that batch only.
 * Blank inputs map to null without a call.
 */
export async function embedTexts(texts: string[]): Promise<(number[] | null)[]> {
  const key = apiKey();
  const out: (number[] | null)[] = new Array(texts.length).fill(null);
  if (!key || texts.length === 0) return out;

  const base = (process.env["EMBEDDING_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env["EMBEDDING_MODEL"] ?? DEFAULT_MODEL;

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    // Track original indices so blanks (skipped) don't shift the response mapping.
    const idxs: number[] = [];
    const inputs: string[] = [];
    for (let i = start; i < Math.min(start + BATCH_SIZE, texts.length); i++) {
      const trimmed = texts[i]!.trim();
      if (trimmed) {
        idxs.push(i);
        inputs.push(trimmed);
      }
    }
    if (inputs.length === 0) continue;

    try {
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, input: inputs }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) {
        console.error(`[embeddings] provider returned ${res.status}`);
        continue;
      }
      const json = (await res.json()) as { data?: Array<{ index?: number; embedding?: number[] }> };
      for (const d of json.data ?? []) {
        const vec = d.embedding;
        if (typeof d.index === "number" && Array.isArray(vec) && vec.length > 0) {
          const original = idxs[d.index];
          if (original !== undefined) out[original] = vec;
        }
      }
    } catch (err) {
      console.error("[embeddings] embed failed:", err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/** Canonical text used to embed a tool: name + description + tags. */
export function toolEmbeddingText(
  name: string,
  description: string | null,
  tags: string[],
): string {
  return `${name} ${description ?? ""} ${tags.join(" ")}`.trim();
}
