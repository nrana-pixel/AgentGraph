import Link from "next/link";

export default function DocsConceptsPage() {
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Concepts</h1>
          <div className="sub">The data model behind every trace.</div>
        </div>
      </div>

      <h2>Trace</h2>
      <p>
        A <strong>trace</strong> is one run of an agent — from the user&apos;s
        prompt to the final response. It groups a set of steps together and
        carries metadata about who triggered it (<code>userId</code>), what
        conversation it belongs to (<code>sessionId</code>), and which
        environment it ran in (<code>env</code>).
      </p>
      <p>
        Every trace has a single <code>agentId</code> — a logical name like{" "}
        <code>support-bot</code> or <code>code-reviewer</code>. The dashboard
        groups stats by agentId so you can see error rates and costs per
        agent.
      </p>

      <h2>Step (Span)</h2>
      <p>
        A <strong>step</strong> (sometimes called a span) is one unit of work
        inside a trace. Each step has a type:
      </p>
      <ul>
        <li><code>llm_call</code> — a call to an LLM. Records model, prompt tokens, completion tokens, and computed cost.</li>
        <li><code>tool_call</code> — invoking a tool (search, RAG, function, API). Records tool name and arguments.</li>
        <li><code>retrieval</code> — fetching from a vector DB or knowledge base.</li>
        <li><code>function</code> — any other unit of work you want to time.</li>
      </ul>
      <p>
        Steps capture inputs, outputs, latency, errors, and tokens. They show
        up as bars in the trace waterfall view.
      </p>

      <h2>Session</h2>
      <p>
        A <strong>session</strong> ties multiple traces to the same end-user
        conversation. Two traces with the same <code>sessionId</code> are part
        of the same back-and-forth — useful for following a thread across many
        turns.
      </p>
      <p>
        Sessions are optional. If you don&apos;t set <code>sessionId</code>,
        each trace stands alone.
      </p>

      <h2>User</h2>
      <p>
        <code>userId</code> identifies the end-user of your agent (not the
        AgentGraph account). Set it to your own internal user identifier so you
        can filter traces per customer in the dashboard.
      </p>

      <h2>Environment</h2>
      <p>
        Each trace is tagged with an <code>env</code>: <code>dev</code>,{" "}
        <code>staging</code>, or <code>prod</code>. The default is{" "}
        <code>prod</code>. Use this to keep test traffic out of your
        production metrics.
      </p>

      <h2>Tool</h2>
      <p>
        A <strong>tool</strong> is anything your agent calls that isn&apos;t an
        LLM — a search API, a vector DB, a function. The AgentGraph catalog
        seeds 83 popular tools (Pinecone, Tavily, Firecrawl, etc.) and grades
        them on success rate, latency, popularity, and sentiment.
      </p>
      <p>
        When your trace includes a <code>tool_call</code> step, AgentGraph
        auto-discovers the tool by its <code>toolName</code>. New tools start
        as <code>data_source: community</code>; once they hit 50+ real calls
        they graduate to <code>telemetry</code>.
      </p>

      <h2>Cost</h2>
      <p>
        Cost is computed at ingest time from a model pricing table on the
        server. You don&apos;t need to send cost from the SDK — just include
        the model name and token counts on each <code>llm_call</code> step,
        and the worker calculates USD per call and per trace.
      </p>
      <p>
        Auto-instrumentation handles this automatically. Manual instrumentation
        needs you to call <code>span.setModel("gpt-4o")</code> and{" "}
        <code>span.setTokenUsage(...)</code>.
      </p>

      <h2>How it flows end-to-end</h2>
      <pre className="code-block">{`Your agent
  │  SDK buffers spans in memory
  │  trace.flush()
  ▼
POST /v1/ingest        → API validates the key, attaches projectId
  │
  ▼
Redis queue            → API returns 202 immediately
  │
  ▼
Worker (background)    → reads queue, computes cost, inserts to Postgres
  │
  ▼
Postgres + Dashboard   → trace appears in /traces`}</pre>

      <div className="docs-callout">
        <strong>The flush is the boundary.</strong> Nothing is sent to the
        server until you call <code>trace.flush()</code>. In long-running
        agents, flush at the end of every session or on shutdown.
      </div>

      <p style={{ marginTop: 24 }}>
        Next: <Link href="/docs/api-reference">API reference →</Link>
      </p>
    </>
  );
}
