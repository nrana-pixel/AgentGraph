# AgentGraph vs. Portkey vs. llm-interceptor

Research comparison. Last updated 2026-05-28.

Sources:
- Portkey — https://portkey.ai/docs/introduction/what-is-portkey
- llm-interceptor — https://github.com/chouzz/llm-interceptor

---

## TL;DR

The three tools live at different layers of the LLM stack:

- **AgentGraph** — *"How are my agents and their tools behaving in production, and which tool should they use?"* Observability + tool-intelligence, SDK-instrumented, runs as a backend platform off the request path.
- **Portkey** — *"Route all my LLM traffic reliably through one gateway."* Inline AI gateway/proxy in front of 250+ models; reliability + multi-provider abstraction.
- **llm-interceptor** — *"Show me the raw prompts my coding tool is sending right now."* Local debugging proxy for AI coding tools.

---

## Side-by-side

| | **AgentGraph** | **Portkey** | **llm-interceptor** |
|---|---|---|---|
| **Category** | Agent observability + tool-intelligence platform | AI gateway / proxy | Local debugging proxy |
| **Position in stack** | Instrumentation SDK → hosted analytics backend (off the request path) | Inline on the request path — every call routes through it | Transparent local proxy between editor and LLM API |
| **Unit of analysis** | A multi-step **agent trace** (steps/spans, tool calls) | A single **model request** (routing, retries, cost) | A raw **request/response pair** on disk |
| **How you adopt it** | Add the `@agentgraph/sdk`, wrap your agent, flush spans | Point your base URL / SDK at the Portkey gateway | Run a local proxy, set it between your editor and the API |
| **Deployment** | Multi-tenant SaaS (API + worker + Postgres + Redis), Clerk auth, billing | Hosted edge gateway (or self-host) | `localhost`, single developer |
| **Primary user** | Teams shipping agents to production | Teams calling many LLM providers in prod | One developer debugging Cursor / Claude Code |
| **In your request path?** | No — out-of-band ingest | Yes — it *is* the path | Yes — transparent proxy |
| **Reliability features (retries, fallbacks, load-balance)** | No (by design) | Yes — core value prop | No |
| **Tool-level intelligence / recommendations** | Yes — the differentiator | No (routes models, not tools) | No |

---

## What each does that the others don't

### AgentGraph's distinctive angle
1. **It models *agents*, not calls.** The core object is a trace with ordered steps/spans (tool calls, LLM calls). Portkey and llm-interceptor both think in single request/response pairs — neither reconstructs "this agent ran 7 steps, called 3 tools, the second failed."
2. **Tool Intelligence layer.** AgentGraph maintains a seeded tool catalog and a recommendation engine that ranks **tools** for a task. Portkey routes between **models**; it has no concept of ranking the tools an agent invokes. llm-interceptor does no analytics.
3. **Off the request path.** You instrument your own code; spans ship out of band. This is the opposite of Portkey, which sits *on* the path (that's how it can retry/fallback/load-balance).

### Portkey's distinctive angle
- Live request routing, provider fallbacks/retries, load-balancing, guardrails, prompt management, a unified API across 250+ models, enterprise compliance (SOC 2 / HIPAA). It's reliability + a universal adapter. AgentGraph assumes you make your own model calls.

### llm-interceptor's distinctive angle
- Zero-setup local capture of **raw** traffic from existing black-box coding tools (Cursor, Claude Code) with no SDK and no code changes — ideal for inspecting what prompts a tool sends. Multi-provider, streaming-aware, masks secrets, local web viewer. It's a dev/debug tool, not a platform.

---

## Closest competitor

On the **observability** axis, Portkey is the nearest. But Portkey's observability is a *side-effect of being a gateway* and is **call-level**; AgentGraph's is **agent/trace-level** with a tool-recommendation layer Portkey lacks. llm-interceptor is really a different category — a local dev tool, not a production platform.

A team could plausibly run **all three**: llm-interceptor while debugging locally, Portkey as the production gateway, and AgentGraph as the trace/cost/tool-intelligence layer reading what the agents actually did.
