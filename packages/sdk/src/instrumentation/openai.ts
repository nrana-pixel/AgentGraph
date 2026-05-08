import type { Trace } from "../trace.js";

// Minimal structural types — avoids requiring openai as a hard dep
interface OpenAIChatCompletion {
  choices: Array<{ message: { role: string; content: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
  model?: string;
}

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

    try {
      const result = await original(...args);
      const completion = result as OpenAIChatCompletion;
      const message = completion.choices[0]?.message;
      if (message !== undefined) span.setOutput({ message });
      if (completion.usage) {
        span.setTokenUsage({
          prompt: completion.usage.prompt_tokens ?? 0,
          completion: completion.usage.completion_tokens ?? 0,
          total: completion.usage.total_tokens ?? 0,
        });
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
