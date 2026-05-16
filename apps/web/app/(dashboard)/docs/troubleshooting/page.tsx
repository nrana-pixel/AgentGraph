import Link from "next/link";

export default function DocsTroubleshootingPage() {
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Troubleshooting</h1>
          <div className="sub">Common errors, what they mean, and how to fix them.</div>
        </div>
      </div>

      <h2>Trace was &quot;sent&quot; but doesn&apos;t appear in the dashboard</h2>
      <p>
        The SDK&apos;s <code>flush()</code> resolving successfully only
        guarantees the API <em>queued</em> the trace. The worker process is
        what actually inserts it into the database. If a trace is missing:
      </p>
      <ul>
        <li>Confirm the worker service is running (check your hosting provider&apos;s logs).</li>
        <li>Make sure the API and worker share the exact same <code>REDIS_URL</code> and <code>DATABASE_URL</code>.</li>
        <li>Look at the worker logs for stack traces — a single bad payload can stall the queue.</li>
        <li>Verify the project that owns your API key is the same one you&apos;re viewing in the dashboard.</li>
      </ul>

      <h2>SDK error messages</h2>

      <h3 className="docs-h3"><code>AgentGraph ingest failed (401)</code></h3>
      <p>
        Your API key is wrong, revoked, or has a typo. Create a new one in{" "}
        <Link href="/settings">Settings</Link> and update your environment
        variable.
      </p>

      <h3 className="docs-h3"><code>AgentGraph ingest failed (402)</code></h3>
      <p>
        Your organization hit its monthly trace limit. Free plan is 10,000
        traces / month, Pro is 500,000, Team is 5,000,000. Check usage on{" "}
        <Link href="/settings">Settings</Link>.
      </p>

      <h3 className="docs-h3"><code>AgentGraph ingest failed (400)</code></h3>
      <p>
        The payload failed Zod validation. The error message includes the
        offending field path. Common causes:
      </p>
      <ul>
        <li><code>agentId</code> is empty — required, must be 1–200 chars</li>
        <li><code>steps</code> is empty — at least one step is required (max 500)</li>
        <li><code>traceId</code> is not a valid UUID</li>
        <li><code>env</code> is not one of <code>&quot;dev&quot;</code>, <code>&quot;staging&quot;</code>, <code>&quot;prod&quot;</code></li>
      </ul>

      <h3 className="docs-h3"><code>AgentGraph ingest failed (404)</code></h3>
      <p>
        The <code>baseUrl</code> points somewhere that doesn&apos;t have the
        AgentGraph API mounted. Double-check the URL has no path component
        beyond the host.
      </p>

      <h3 className="docs-h3"><code>ReferenceError: fetch is not defined</code></h3>
      <p>
        Node 16 or older. The SDK uses native <code>fetch</code>, which requires
        Node 18+. Upgrade Node, or polyfill <code>fetch</code> globally if you
        can&apos;t.
      </p>

      <h3 className="docs-h3"><code>Cannot find module &apos;@agentgraph/sdk&apos;</code></h3>
      <p>The install didn&apos;t complete. Re-run:</p>
      <pre className="code-block">{`npm install ./agentgraph-sdk-0.1.0.tgz`}</pre>
      <p>
        If you&apos;re using TypeScript and the runtime works but types don&apos;t
        resolve, make sure <code>moduleResolution</code> is set to{" "}
        <code>&quot;bundler&quot;</code> or <code>&quot;nodenext&quot;</code> in
        your <code>tsconfig.json</code>.
      </p>

      <h2>Auto-instrumentation isn&apos;t capturing calls</h2>
      <ul>
        <li>
          <strong>Order matters.</strong> Call <code>instrumentOpenAI(client, trace)</code>{" "}
          <em>before</em> the LLM call, not after.
        </li>
        <li>
          <strong>Use the same client instance.</strong> The patcher mutates the
          object you pass in. A different OpenAI/Anthropic instance won&apos;t be
          patched.
        </li>
        <li>
          <strong>Don&apos;t reassign methods.</strong> If your code does{" "}
          <code>const create = openai.chat.completions.create</code> before
          instrumenting, that reference still points at the unpatched function.
        </li>
      </ul>

      <h2>Traces show but cost is always $0</h2>
      <p>
        Cost is computed from <code>model</code> + <code>tokenUsage</code> on{" "}
        <code>llm_call</code> steps. If you&apos;re instrumenting manually:
      </p>
      <pre className="code-block">{`await trace.step("llm_call", "chat", async (span) => {
  span.setModel("gpt-4o-mini");                       // ← required
  const res = await openai.chat.completions.create({ ... });
  span.setTokenUsage({                                 // ← required
    prompt: res.usage.prompt_tokens,
    completion: res.usage.completion_tokens,
    total: res.usage.total_tokens,
  });
  span.setOutput({ text: res.choices[0].message.content });
});`}</pre>
      <p>
        Auto-instrumentation does all of this for you. Manual steps need it
        explicitly.
      </p>

      <h2>My tool isn&apos;t showing up in the catalog</h2>
      <ul>
        <li>The step type must be <code>&quot;tool_call&quot;</code> — other types don&apos;t auto-discover.</li>
        <li><code>setToolName(...)</code> must be called on the span (or <code>toolName</code> passed in the step input).</li>
        <li>Tools start with <code>data_source: community</code> and are capped at 70/100 score until they hit 50 real calls.</li>
      </ul>

      <h2>Still stuck?</h2>
      <p>
        Open an issue with: your Node version, SDK version, the full error
        message, and a minimal reproduction. Including the trace ID (if you
        have one) lets us look up the exact payload in our logs.
      </p>
    </>
  );
}
