// Pluggable text-embedding provider.
//
// Embeddings are OPTIONAL: when no provider is configured (no API key), every
// function degrades gracefully — `embedText` returns null and discovery falls
// back to keyword/FTS relevance. This keeps the system fully functional with
// zero external dependencies, and lets a deployment "turn on" semantic ranking
// by setting EMBEDDING_API_KEY.
//
// Provider is OpenAI-compatible (`/v1/embeddings`), which covers OpenAI, Azure
// OpenAI, and most local servers (Ollama, LM Studio, vLLM) via EMBEDDING_BASE_URL.

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";

function apiKey(): string | null {
  return process.env["EMBEDDING_API_KEY"] ?? process.env["OPENAI_API_KEY"] ?? null;
}

/** True when an embedding provider is configured. */
export function embeddingsEnabled(): boolean {
  return apiKey() !== null;
}

/**
 * Embed a single string. Returns null when embeddings are unconfigured or the
 * provider call fails — callers MUST treat null as "no semantic signal" and
 * fall back, never as an error.
 */
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
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
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

/** Cosine similarity of two equal-length vectors, in [-1, 1]. 0 on mismatch. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Parse a stored JSON float-array embedding; null on absence/parse failure. */
export function parseStoredEmbedding(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((n) => typeof n === "number")
      ? (parsed as number[])
      : null;
  } catch {
    return null;
  }
}
