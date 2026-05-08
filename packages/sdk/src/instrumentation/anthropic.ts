import type { Trace } from "../trace.js";

interface AnthropicClient {
  messages: {
    create: (...args: unknown[]) => Promise<unknown>;
  };
}

export function instrumentAnthropic(client: AnthropicClient, trace: Trace): void {
  const original = client.messages.create.bind(client.messages);

  client.messages.create = async (...args: unknown[]): Promise<unknown> => {
    const params = args[0] as Record<string, unknown>;
    const model = typeof params["model"] === "string" ? params["model"] : "unknown";
    const span = trace.startSpan("llm_call", `${model} message`);

    span.setModel(model);
    const input: Record<string, unknown> = {};
    if (params["messages"] !== undefined) input["messages"] = params["messages"];
    if (typeof params["system"] === "string") input["system"] = params["system"];
    if (Object.keys(input).length > 0) span.setInput(input);

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
      const content = Array.isArray(r["content"]) ? r["content"] : [];
      const textBlock = content.find(
        (b: unknown) => (b as Record<string, unknown>)?.["type"] === "text"
      ) as Record<string, unknown> | undefined;
      const text = typeof textBlock?.["text"] === "string" ? textBlock["text"] : "";
      span.setOutput({ text, stop_reason: (r["stop_reason"] as string | null | undefined) ?? null });
      const usage = r["usage"];
      if (usage !== null && typeof usage === "object") {
        const u = usage as Record<string, unknown>;
        const inp = (u["input_tokens"] as number | undefined) ?? 0;
        const out = (u["output_tokens"] as number | undefined) ?? 0;
        span.setTokenUsage({ prompt: inp, completion: out, total: inp + out });
      }
    } catch { /* ignore */ }

    span.end();
    trace.addSpan(span);
    return result;
  };
}
