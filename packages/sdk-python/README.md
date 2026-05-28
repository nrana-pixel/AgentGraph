# agentgraph (Python SDK)

OpenTelemetry-style tracing for AI agents. Mirrors the TypeScript
`@agentgraph/sdk` and posts traces to the AgentGraph API's `POST /v1/ingest`.

The core has **zero required third-party dependencies** — the HTTP POST uses
the standard library `urllib.request`. OpenAI/Anthropic instrumentation are
optional extras.

## Install

```bash
pip install agentgraph                 # core, zero deps
pip install "agentgraph[openai]"       # + OpenAI auto-instrumentation
pip install "agentgraph[anthropic]"    # + Anthropic auto-instrumentation
```

## Usage

```python
from agentgraph import AgentGraph

ag = AgentGraph(api_key="ag_live_...", base_url="http://localhost:3001")

# Context manager auto-flushes on exit (status="error" if it raises).
with ag.trace(agent_id="my-agent", session_id="s1", user_id="u1") as trace:
    def run(span):
        span.set_input({"query": "cats"})
        results = search("cats")
        span.set_output({"results": results})
        return results

    data = trace.step("tool_call", "web_search", run)
```

Or flush manually:

```python
trace = ag.trace(agent_id="my-agent")
trace.step("llm_call", "summarise", lambda span: do_work(span))
trace.flush()  # POST /v1/ingest
```

## Auto-instrumentation

```python
from agentgraph.instrumentation import instrument_openai, instrument_anthropic

instrument_openai(openai_client, trace)
instrument_anthropic(anthropic_client, trace)
```
