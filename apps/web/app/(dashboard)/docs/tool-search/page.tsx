import Link from "next/link";

export default function DocsToolSearchPage() {
  return (
    <>
      <div className="page-h">
        <div>
          <h1>Use AgentGraph as your tool-search backend</h1>
          <div className="sub">
            Rerank the tools an agent could call by real-world reliability — before it picks one.
          </div>
        </div>
      </div>

      <p>
        Retrievers like Anthropic&apos;s Tool Search or a vector index pick candidate tools by{" "}
        <em>semantic match</em> — they have no idea which one actually works. AgentGraph&apos;s{" "}
        <code>POST /v1/rerank</code> is the quality layer on top: hand it the candidates an upstream
        retriever selected, and it returns them reordered by real-world success rate, latency, cost,
        and your own org&apos;s history. Retrieval stays where it is; you just stop letting the
        agent pick a flaky tool.
      </p>

      <h2>The endpoint</h2>
      <p>
        Send the task plus a candidate list. Each candidate is either a catalog{" "}
        <code>{`{ slug }`}</code> or a <code>{`{ name }`}</code> to resolve. Unknown candidates are
        never dropped — they pass through ranked after the scored ones, so the agent always sees its
        full set.
      </p>
      <pre className="code-block">{`curl -X POST https://your-api.example.com/v1/rerank \\
  -H "Authorization: Bearer ag_live_xxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "task": "send a transactional email",
    "candidates": [
      { "slug": "sendgrid" },
      { "slug": "mailgun" },
      { "name": "Some SMTP Tool" }
    ],
    "limit": 5
  }'`}</pre>

      <p>
        The response is <code>{`{ task, ranked: DiscoveredTool[] }`}</code> — the same item shape as{" "}
        <Link href="/docs/api-reference">/v1/discover</Link>, with <code>reliabilityScore</code>,{" "}
        <code>gradeBand</code>, latency, and a per-signal <code>scores</code> breakdown so you can
        see <em>why</em> each tool ranked.
      </p>

      <h2>From the SDK</h2>
      <pre className="code-block">{`import { AgentGraph } from "@agentgraph/sdk";

const ag = new AgentGraph({ apiKey: process.env.AGENTGRAPH_API_KEY });

// candidates your retriever already chose (slugs or names)
const { ranked } = await ag.rerank("send a transactional email", [
  { slug: "sendgrid" },
  { slug: "mailgun" },
]);

// ranked[0] is the most reliable choice for this task
const best = ranked[0];`}</pre>
      <p>
        <code>rerank()</code> retries transient failures with backoff like <code>discover()</code>,
        but never queues — a ranking is only useful in the moment, so an exhausted call throws
        rather than being deferred.
      </p>

      <h2>Wiring it into Anthropic Tool Search</h2>
      <p>
        Anthropic&apos;s Tool Search returns candidate tools by name/description match. Use a custom
        tool-search handler that defers the <em>ordering</em> to AgentGraph: keep their retrieval,
        rerank the result, and expose the top few to the model.
      </p>
      <pre className="code-block">{`// Pseudocode for a custom tool-search hook.
// 1. Let Anthropic Tool Search (or your retriever) pick candidates.
const candidates = await toolSearch(query); // [{ name, description }, ...]

// 2. Rerank by real-world reliability.
const { ranked } = await ag.rerank(query, candidates.map((c) => ({ name: c.name })));

// 3. Surface only the top-N reliable tools to the model's context.
const toolsForModel = ranked.slice(0, 5);`}</pre>

      <h2>Non-Anthropic stacks</h2>
      <p>
        The pattern is provider-neutral. Any retriever — OpenAI function-calling, a vector DB,
        Gemini, an open model — produces candidate tools; pass them through <code>/v1/rerank</code>{" "}
        before you load definitions into context:
      </p>
      <pre className="code-block">{`// e.g. you keep your own embedding index of tools
const candidates = await myVectorIndex.search(task, { k: 20 });

const { ranked } = await ag.rerank(task, candidates.map((c) => ({ slug: c.slug })));
// load only ranked.slice(0, 5) into the model's tool list`}</pre>

      <div className="docs-callout">
        <strong>Why this matters:</strong> tool-selection accuracy degrades sharply once an agent
        sees more than a handful of tools. Reranking by evidence — and trimming to the top few —
        keeps context small <em>and</em> steers the model toward tools that actually succeed.
      </div>
    </>
  );
}
