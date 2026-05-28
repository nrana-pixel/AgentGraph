/**
 * Token pricing table (USD per 1M tokens).
 * Input (prompt) and output (completion) priced separately.
 * Updated: May 2026. Refresh monthly.
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_COSTS: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4-turbo": { inputPer1M: 10.0, outputPer1M: 30.0 },
  "gpt-4": { inputPer1M: 30.0, outputPer1M: 60.0 },
  "gpt-3.5-turbo": { inputPer1M: 0.5, outputPer1M: 1.5 },
  "o1": { inputPer1M: 15.0, outputPer1M: 60.0 },
  "o1-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  "o3": { inputPer1M: 10.0, outputPer1M: 40.0 },
  "o3-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  "gpt-4.1": { inputPer1M: 2.0, outputPer1M: 8.0 },
  "gpt-4.1-mini": { inputPer1M: 0.4, outputPer1M: 1.6 },
  "gpt-4.1-nano": { inputPer1M: 0.1, outputPer1M: 0.4 },

  // Anthropic
  "claude-opus-4-7": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-sonnet-4-6": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-4-5": { inputPer1M: 0.8, outputPer1M: 4.0 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4.0 },
  "claude-3-opus-20240229": { inputPer1M: 15.0, outputPer1M: 75.0 },
  "claude-3-haiku-20240307": { inputPer1M: 0.25, outputPer1M: 1.25 },

  // Google
  "gemini-2.0-flash": { inputPer1M: 0.1, outputPer1M: 0.4 },
  "gemini-2.0-flash-lite": { inputPer1M: 0.075, outputPer1M: 0.3 },
  "gemini-1.5-pro": { inputPer1M: 1.25, outputPer1M: 5.0 },
  "gemini-1.5-flash": { inputPer1M: 0.075, outputPer1M: 0.3 },

  // Meta / open weights (hosted)
  "llama-3.3-70b": { inputPer1M: 0.88, outputPer1M: 0.88 },
  "llama-3.1-405b": { inputPer1M: 3.0, outputPer1M: 3.0 },
  "llama-3.1-70b": { inputPer1M: 0.88, outputPer1M: 0.88 },
  "llama-3.1-8b": { inputPer1M: 0.18, outputPer1M: 0.18 },

  // Mistral
  "mistral-large": { inputPer1M: 2.0, outputPer1M: 6.0 },
  "mistral-small": { inputPer1M: 0.2, outputPer1M: 0.6 },

  // Cohere
  "command-r-plus": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "command-r": { inputPer1M: 0.5, outputPer1M: 1.5 },
};

/**
 * Compute cost for a single LLM call in USD.
 * Returns null if the model is unknown (SDK should pass cost directly when known).
 */
export function computeCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  // Try exact match first, then longest-prefix match for versioned model names.
  // Sorting by descending key length ensures "gpt-4o-mini" beats "gpt-4o"
  // when the model string is e.g. "gpt-4o-mini-2026-05".
  const pricing =
    MODEL_COSTS[model] ??
    Object.entries(MODEL_COSTS)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([key]) => model.startsWith(key))?.[1];

  if (!pricing) return null;

  return (
    (promptTokens / 1_000_000) * pricing.inputPer1M +
    (completionTokens / 1_000_000) * pricing.outputPer1M
  );
}
