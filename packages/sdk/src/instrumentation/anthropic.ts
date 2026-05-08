import type { Trace } from "../trace.js";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessage {
  content: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  stop_reason?: string | null;
}

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
    if (params["messages"] !== undefined) span.setInput({ messages: params["messages"] });
    if (typeof params["system"] === "string") span.setInput({ system: params["system"], messages: params["messages"] });

    try {
      const result = await original(...args);
      const msg = result as AnthropicMessage;
      const text = msg.content.find((b) => b.type === "text")?.text ?? "";
      span.setOutput({ text, stop_reason: msg.stop_reason ?? null });
      if (msg.usage) {
        const input = msg.usage.input_tokens ?? 0;
        const output = msg.usage.output_tokens ?? 0;
        span.setTokenUsage({ prompt: input, completion: output, total: input + output });
      }
      span.end();
      trace.addSpan(span);
      return result;
    } catch (err) {
      span.setError(err instanceof Error ? err : String(err)).end();
      trace.addSpan(span);
      throw err;
    }
  };
}
