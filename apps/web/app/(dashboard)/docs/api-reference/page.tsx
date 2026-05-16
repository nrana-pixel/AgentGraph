import Link from "next/link";

export default function DocsApiReferencePage() {
  return (
    <>
      <div className="page-h">
        <div>
          <h1>API reference</h1>
          <div className="sub">Every public class and method in @agentgraph/sdk.</div>
        </div>
      </div>

      <h2>AgentGraph</h2>
      <p>The top-level client. Construct once per process.</p>
      <pre className="code-block">{`new AgentGraph({
  apiKey: string;        // your ag_live_... or ag_test_... key
  baseUrl?: string;      // default: https://api.agentgraph.dev
})`}</pre>

      <h3 className="docs-h3"><code>ag.trace(options)</code></h3>
      <p>Create a new trace. Returns a <code>Trace</code> instance.</p>
      <pre className="code-block">{`ag.trace({
  agentId: string;                          // required — logical agent name
  traceId?: string;                         // optional — auto-generated if omitted
  sessionId?: string;                       // optional — groups related traces
  userId?: string;                          // optional — your end-user identifier
  env?: "dev" | "staging" | "prod";         // default: "prod"
  metadata?: Record<string, unknown>;       // attached as-is to the trace
}): Trace`}</pre>

      <h2>Trace</h2>
      <p>One run of an agent. Buffers spans in memory until <code>flush()</code>.</p>

      <h3 className="docs-h3"><code>trace.step(type, name, fn)</code></h3>
      <p>
        Run <code>fn</code> inside a span. Latency is measured automatically.
        Exceptions are caught, attached to the span, then re-thrown so your
        own error handling still runs.
      </p>
      <pre className="code-block">{`await trace.step(
  type: "llm_call" | "tool_call" | "retrieval" | "function",
  name: string,
  fn: (span: Span) => Promise<T>
): Promise<T>`}</pre>

      <h3 className="docs-h3"><code>trace.startSpan(type, name)</code></h3>
      <p>
        Lower-level — manually create a span you control. Use this when
        wrapping work in a callback isn&apos;t convenient.
      </p>
      <pre className="code-block">{`const span = trace.startSpan("tool_call", "web_search");
span.setInput({ query: "..." });
try {
  const result = await doSearch();
  span.setOutput({ result });
} catch (err) {
  span.setError(err);
  throw err;
} finally {
  span.end();
  trace.addSpan(span);
}`}</pre>

      <h3 className="docs-h3"><code>trace.flush(status?)</code></h3>
      <p>
        Send the trace to AgentGraph. Idempotent — subsequent calls are no-ops.
        <code>status</code> defaults to <code>&quot;completed&quot;</code>; pass{" "}
        <code>&quot;error&quot;</code> if the run failed overall.
      </p>
      <pre className="code-block">{`await trace.flush(status?: "completed" | "error" | "running")`}</pre>

      <h2>Span</h2>
      <p>
        One step inside a trace. All setter methods return <code>this</code>{" "}
        for chaining.
      </p>

      <table className="docs-table">
        <thead>
          <tr>
            <th>Method</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>setInput(obj)</code></td><td>Arguments / prompt for this step.</td></tr>
          <tr><td><code>setOutput(obj)</code></td><td>Return value / completion.</td></tr>
          <tr><td><code>setModel(name)</code></td><td>Model identifier — used for cost lookup. e.g. <code>&quot;gpt-4o-mini&quot;</code>.</td></tr>
          <tr><td><code>setTokenUsage(usage)</code></td><td><code>{`{ prompt, completion, total }`}</code> — server computes cost from this + model.</td></tr>
          <tr><td><code>setCost(usd)</code></td><td>Override the computed cost (advanced).</td></tr>
          <tr><td><code>setToolName(name)</code></td><td>Tool slug — used for auto-discovery in the catalog.</td></tr>
          <tr><td><code>setToolVersion(v)</code></td><td>Optional tool version string.</td></tr>
          <tr><td><code>setError(err)</code></td><td>Mark the span as failed.</td></tr>
          <tr><td><code>end()</code></td><td>Stop the latency timer. Called automatically inside <code>trace.step()</code>.</td></tr>
        </tbody>
      </table>

      <h2>Auto-instrumentation entry points</h2>
      <p>
        Each lives at a separate import path so unused ones get tree-shaken.
        Both require an active <code>trace</code>.
      </p>
      <pre className="code-block">{`import { instrumentOpenAI } from "@agentgraph/sdk/openai";
instrumentOpenAI(openaiClient, trace);

import { instrumentAnthropic } from "@agentgraph/sdk/anthropic";
instrumentAnthropic(anthropicClient, trace);`}</pre>
      <p>
        See <Link href="/docs/auto-instrumentation">Auto-instrumentation</Link> for
        details on what gets captured.
      </p>

      <h2>Types</h2>
      <p>
        All types are exported from the main entry point:{" "}
        <code>AgentGraphConfig</code>, <code>TraceOptions</code>,{" "}
        <code>StepType</code>, <code>TokenUsage</code>. Import them with{" "}
        <code>import type</code> for zero runtime cost.
      </p>

      <p style={{ marginTop: 24 }}>
        Stuck? See <Link href="/docs/troubleshooting">Troubleshooting →</Link>
      </p>
    </>
  );
}
