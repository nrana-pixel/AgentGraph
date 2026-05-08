import type { Trace } from "../trace.js";

interface OpenAIClient {
  chat: {
    completions: {
      create: (...args: unknown[]) => Promise<unknown>;
    };
  };
}

export function instrumentOpenAI(client: OpenAIClient, trace: Trace): void {
  const original = client.chat.completions.create.bind(client.chat.completions);

  client.chat.completions.create = async (...args: unknown[]): Promise<unknown> => {
    const params = args[0] as Record<string, unknown>;
    const model = typeof params["model"] === "string" ? params["model"] : "unknown";
    const span = trace.startSpan("llm_call", `${model} completion`);

    span.setModel(model);
    if (params["messages"] !== undefined) span.setInput({ messages: params["messages"] });

    let result: unknown;
    try {
      result = await original(...args);
    } catch (err) {
      span.setError(err instanceof Error ? err : String(err)).end();
      trace.addSpan(span);
      throw err;
    }

    // Best-effort response parsing — never crash the caller
    try {
      const r = result as Record<string, unknown>;
      const choices = Array.isArray(r["choices"]) ? r["choices"] : [];
      const first = choices[0] as Record<string, unknown> | undefined;
      const message = first?.["message"];
      if (message !== undefined) span.setOutput({ message });
      const usage = r["usage"];
      if (usage !== null && typeof usage === "object") {
        const u = usage as Record<string, unknown>;
        span.setTokenUsage({
          prompt: (u["prompt_tokens"] as number | undefined) ?? 0,
          completion: (u["completion_tokens"] as number | undefined) ?? 0,
          total: (u["total_tokens"] as number | undefined) ?? 0,
        });
      }
    } catch { /* ignore */ }

    span.end();
    trace.addSpan(span);
    return result;
  };
}
