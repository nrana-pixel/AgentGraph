import Link from "next/link";

export default function DocsOverviewPage() {
  return (
    <>
      <div className="page-h">
        <div>
          <h1>SDK documentation</h1>
          <div className="sub">Instrument your agent in under 5 minutes.</div>
        </div>
      </div>

      <p>
        AgentGraph gives you OpenTelemetry-style tracing for AI agents. You install
        the SDK in your agent, send traces from each run, and every LLM call, tool
        invocation, latency, and cost shows up in this dashboard.
      </p>

      <h2>What you can do</h2>
      <ul>
        <li><strong>Trace every step</strong> — manually wrap work with <code>trace.step()</code>, or auto-instrument OpenAI / Anthropic with one line.</li>
        <li><strong>See real costs</strong> — token usage and USD spend per call, per model, per agent.</li>
        <li><strong>Catch regressions</strong> — sidebar trace count, status filters, error rates per agent.</li>
        <li><strong>Get alerted</strong> — webhooks fire when a trace costs ≥ $1.</li>
      </ul>

      <h2>Where to start</h2>
      <div className="docs-card-grid">
        <Link href="/docs/quickstart" className="docs-card">
          <div className="docs-card-title">Quickstart →</div>
          <div className="docs-card-sub">Install the SDK and send your first trace.</div>
        </Link>
        <Link href="/docs/concepts" className="docs-card">
          <div className="docs-card-title">Concepts →</div>
          <div className="docs-card-sub">Traces, spans, agents, sessions — what they mean.</div>
        </Link>
        <Link href="/docs/auto-instrumentation" className="docs-card">
          <div className="docs-card-title">Auto-instrumentation →</div>
          <div className="docs-card-sub">Trace OpenAI and Anthropic calls without writing wrappers.</div>
        </Link>
        <Link href="/docs/api-reference" className="docs-card">
          <div className="docs-card-title">API reference →</div>
          <div className="docs-card-sub">Every method on AgentGraph, Trace, and Span.</div>
        </Link>
      </div>

      <h2>Requirements</h2>
      <ul>
        <li>Node.js 18 or higher (the SDK uses native <code>fetch</code>)</li>
        <li>An <code>ag_live_…</code> API key — create one in <Link href="/settings">Settings</Link></li>
      </ul>

      <div className="docs-callout">
        <strong>Private beta.</strong> The SDK is not yet published to npm. You
        install it from a tarball provided by us. See the{" "}
        <Link href="/docs/quickstart">Quickstart</Link> for instructions.
      </div>
    </>
  );
}
