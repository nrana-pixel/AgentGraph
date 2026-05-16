import Link from "next/link";

export default function DocsAutoInstrumentationPage() {
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Auto-instrumentation</h1>
          <div className="sub">One line to trace every OpenAI or Anthropic call.</div>
        </div>
      </div>

      <p>
        Manual instrumentation (wrapping every LLM call in <code>trace.step()</code>)
        works, but it&apos;s verbose. AgentGraph ships with patchers that
        monkey-patch the OpenAI and Anthropic SDK clients in place — every
        subsequent call is traced without any code changes.
      </p>

      <h2>OpenAI</h2>
      <pre className="code-block">{`import OpenAI from "openai";
import { AgentGraph } from "@agentgraph/sdk";
import { instrumentOpenAI } from "@agentgraph/sdk/openai";

const openai = new OpenAI();
const ag = new AgentGraph({
  apiKey: process.env.AGENTGRAPH_API_KEY,
  baseUrl: process.env.AGENTGRAPH_API_URL,
});

const trace = ag.trace({ agentId: "my-agent", sessionId: "s1", userId: "u1" });

instrumentOpenAI(openai, trace);  // ← all subsequent calls are traced

const response = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "What is the capital of France?" }],
});

await trace.flush();`}</pre>

      <p>What gets captured automatically:</p>
      <ul>
        <li><strong>Model</strong> — pulled from the request</li>
        <li><strong>Prompt + completion</strong> — full messages, attached as input/output</li>
        <li><strong>Tokens</strong> — from the response&apos;s <code>usage</code> field</li>
        <li><strong>Latency</strong> — measured around the request</li>
        <li><strong>Cost</strong> — computed server-side from the model + token counts</li>
        <li><strong>Errors</strong> — exceptions are attached to the span and the trace is marked failed</li>
      </ul>

      <h2>Anthropic</h2>
      <pre className="code-block">{`import Anthropic from "@anthropic-ai/sdk";
import { AgentGraph } from "@agentgraph/sdk";
import { instrumentAnthropic } from "@agentgraph/sdk/anthropic";

const anthropic = new Anthropic();
const ag = new AgentGraph({
  apiKey: process.env.AGENTGRAPH_API_KEY,
  baseUrl: process.env.AGENTGRAPH_API_URL,
});

const trace = ag.trace({ agentId: "my-agent", sessionId: "s1", userId: "u1" });

instrumentAnthropic(anthropic, trace);  // ← all messages.create calls are traced

const message = await anthropic.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Summarize this PR." }],
});

await trace.flush();`}</pre>

      <h2>Combining auto + manual</h2>
      <p>
        You can mix freely. The patcher only instruments LLM SDK calls — your
        own tool calls and retrieval steps still need <code>trace.step()</code>:
      </p>
      <pre className="code-block">{`instrumentOpenAI(openai, trace);

// Auto-traced LLM call
const planning = await openai.chat.completions.create({ ... });

// Manually-traced tool call
await trace.step("tool_call", "vector_search", async (span) => {
  span.setInput({ query: planning.choices[0].message.content });
  const results = await pinecone.query({ ... });
  span.setOutput({ matches: results.matches.length });
});

// Auto-traced LLM call
const answer = await openai.chat.completions.create({ ... });

await trace.flush();`}</pre>

      <h2>Per-call control</h2>
      <p>
        Once you call <code>instrumentOpenAI(client, trace)</code>, every
        call on that client instance is attached to that trace. To send
        different calls to different traces, instrument once per trace and
        keep the client instances separate, or call{" "}
        <code>instrumentOpenAI</code> with the new trace before the next call.
      </p>

      <div className="docs-callout">
        <strong>The patcher mutates the client object.</strong> Don&apos;t
        share an instrumented client across unrelated agents — they&apos;ll all
        write into the trace you last attached.
      </div>

      <h2>Streaming responses</h2>
      <p>
        Streaming is supported. The patcher waits for the stream to finish
        before recording the span, so token counts and the full completion are
        captured. Latency reflects time-to-last-token, not time-to-first-token.
      </p>

      <h2>Supported versions</h2>
      <ul>
        <li><code>openai</code> ≥ 4.0.0 (declared as an optional peer dependency)</li>
        <li><code>@anthropic-ai/sdk</code> ≥ 0.24.0 (declared as an optional peer dependency)</li>
      </ul>
      <p>
        If you install the SDK without OpenAI or Anthropic, the main{" "}
        <code>@agentgraph/sdk</code> import still works — only the patcher
        subpaths will fail to load.
      </p>

      <p style={{ marginTop: 24 }}>
        Next: <Link href="/docs/api-reference">API reference →</Link>
      </p>
    </>
  );
}
