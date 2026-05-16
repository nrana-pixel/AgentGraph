import Link from "next/link";

export default function DocsQuickstartPage() {
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Quickstart</h1>
          <div className="sub">Install the SDK and send your first trace in under 5 minutes.</div>
        </div>
      </div>

      <h2>1. Get an API key</h2>
      <ol>
        <li>Go to <Link href="/settings">Settings</Link>.</li>
        <li>Create a project (if you haven&apos;t already).</li>
        <li>Click <strong>New API key</strong> and copy the <code>ag_live_…</code> value. It is shown only once.</li>
      </ol>

      <h2>2. Install the SDK</h2>
      <p>
        During the private beta the SDK ships as a tarball. Copy{" "}
        <code>agentgraph-sdk-0.1.0.tgz</code> into your project, then:
      </p>
      <pre className="code-block">{`npm install ./agentgraph-sdk-0.1.0.tgz`}</pre>

      <p>
        Your <code>package.json</code> will reference it as a file dependency. The
        SDK has zero runtime dependencies.
      </p>

      <h2>3. Send your first trace</h2>
      <p>Create <code>smoke.mjs</code>:</p>
      <pre className="code-block">{`import { AgentGraph } from "@agentgraph/sdk";

const ag = new AgentGraph({
  apiKey: process.env.AGENTGRAPH_API_KEY,
  baseUrl: process.env.AGENTGRAPH_API_URL,
});

const trace = ag.trace({
  agentId: "my-first-agent",
  sessionId: "session-1",
  userId: "user-1",
});

await trace.step("tool_call", "web_search", async (span) => {
  span.setInput({ query: "hello world" });
  span.setOutput({ results: ["a", "b", "c"] });
});

await trace.flush();
console.log("✓ trace sent");`}</pre>

      <p>Run it:</p>
      <pre className="code-block">{`AGENTGRAPH_API_KEY=ag_live_xxxxxxxx \\
AGENTGRAPH_API_URL=https://your-api.example.com \\
node smoke.mjs`}</pre>

      <div className="docs-callout">
        <strong>About <code>baseUrl</code>.</strong> The default is{" "}
        <code>https://api.agentgraph.dev</code>. If you are running your own
        deployment (Render, Railway, self-hosted), pass <code>baseUrl</code> with
        your API service URL. No trailing slash needed — leading/trailing slashes
        are normalized.
      </div>

      <h2>4. Verify in the dashboard</h2>
      <ul>
        <li><Link href="/traces">Traces</Link> — your new trace appears at the top within ~2 seconds.</li>
        <li>The <strong>Traces</strong> count in the sidebar increments by 1.</li>
        <li>Click into the trace — you&apos;ll see a waterfall view with the <code>web_search</code> step.</li>
        <li><Link href="/tools">Tool catalog</Link> — if <code>web_search</code> wasn&apos;t already there, it auto-discovers as a community tool.</li>
      </ul>

      <h2>Next steps</h2>
      <ul>
        <li><Link href="/docs/auto-instrumentation">Auto-instrument OpenAI / Anthropic</Link> — one line to trace every LLM call.</li>
        <li><Link href="/docs/concepts">Understand the data model</Link> — traces vs spans, sessions, agents.</li>
        <li><Link href="/docs/troubleshooting">Troubleshooting</Link> — if something doesn&apos;t work.</li>
      </ul>
    </>
  );
}
