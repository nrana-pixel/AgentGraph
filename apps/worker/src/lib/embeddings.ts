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
  const key = apiKey();
  if (!key) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const base = (process.env["EMBEDDING_BASE_URL"] ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env["EMBEDDING_MODEL"] ?? DEFAULT_MODEL;

  try {
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: trimmed }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      console.error(`[embeddings] provider returned ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
    const vec = json.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.length > 0 ? vec : null;
  } catch (err) {
    console.error("[embeddings] embed failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
