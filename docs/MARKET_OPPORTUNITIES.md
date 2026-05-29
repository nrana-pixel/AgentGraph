# AgentGraph — Market Opportunities & Build Thesis

**Drafted:** 2026-05-29 · **Owner:** @nrana-pixel
**Source:** synthesis of an 8-agent market-research sprint (~66 web searches; competitor, MCP, eval, security, cost, funding, multi-agent, practitioner-pains). Citations live in the per-angle notes; key ones inlined below.

> Companion docs: strategy/sequencing in [`NEXT_STEPS.md`](./NEXT_STEPS.md); build specs in [`specs/`](./specs/).

---

## The one conclusion

**Build the neutral, cross-customer *reliability & trust layer* for AI tools — "the credit rating for AI tools."**

Every observability/eval competitor sees *one customer's* data and *shows* tool calls in a trace. **Not one of them scores a tool as a product across customers, ranks tools by real-world reliability, or detects when a tool is regressing for everyone.** That seat is empty and it's uniquely ours: it requires pooled cross-customer telemetry — the one input a model vendor or a single-tenant competitor structurally cannot replicate.

This is not a pivot. It points the engine we already shipped (`recommendationEngine`, `tool_global_stats`, `/v1/discover`, cost-spike webhooks) at the highest-fit open gap in the market.

---

## Why (8 independent angles converged on this)

### Three meta-patterns that repeated across agents
1. **Tool quality is invisible.** Everything retrieves tools by *semantic match*; nothing ranks by *what actually works*. Anthropic Tool Search (GA, ~85% token cut) is quality-blind; so are RAG-MCP / MCP-Zero. The competitor matrix had the "runtime tool recommendation" column **empty across 11 platforms**.
2. **"Visibility ≠ control" (the observe→enforce gap).** 88% of enterprises had an agent incident, only 21% have runtime visibility. 98% of FinOps teams manage AI spend, only 44% have guardrails. Gartner: 50% of agent failures by 2030 trace to insufficient runtime governance.
3. **Reliability is *the* discipline of 2026, and it lives "on traces."** LangChain: reliability = #1 barrier (32%). Gartner: >40% of agentic projects cancelled by 2027. MAST: 74% of multi-agent failures are coordination/handoff/spec — invisible in per-agent logs.

### Market context
- **Generic observability/eval is crowded & consolidating** — LangChain $125M@$1.25B, Braintrust $80M@$800M, **OpenAI acquired Promptfoo**, Langfuse → ClickHouse. But *"no funded leader owns telemetry-driven tool ranking."*
- **Security pays 10x:** ~$392M agentic-security funding in 2 weeks around RSAC; Lakera → Check Point ~$300M; Snyk bought Invariant Labs. MCP: 30 CVEs/60 days, 9/11 registries poisoned in a PoC, no trust standard.
- **a16z framing = our positioning:** observability/governance is a *"vertical rail that touches every layer,"* and *neutrality is both a moat and an acquisition narrative* ("if your eval is owned by a model vendor, is the grading neutral?").
- **Timing:** YC W26 ≈ 41.5% building agent plumbing. The differentiated window is ~12–18 months.

### Practitioner pains — frequency vs. fit
By raw complaint frequency: non-determinism (#1), eval (#2), debugging (#3), cost (#4), **tool-selection/MCP-overload (#5)**. The louder pains are symptom-only (non-determinism) or crowded (eval). Tool-selection is scored an **"emerging gap"** with the verdict *"This is AgentGraph's bullseye — no incumbent owns runtime, data-driven tool recommendation."* → **#5 by volume, #1 by fit × open-whitespace.**

**Served vs. gap (what to avoid vs. own):**

| Pain | Status | Our move |
|---|---|---|
| Non-determinism | Gap (symptoms only) | Don't chase the root cause |
| Eval (trajectories) | Crowded; gap for multi-step | Feed our data in; don't be a judge |
| Cost **attribution** | **Gap** (caps exist, attribution doesn't) | ✅ Own it |
| **Tool selection / MCP overload** | **Emerging gap, no owner** | ✅ **Bullseye** |
| **Loops / runaway retries** | **Gap** (DIY hacks) | ✅ Detect it |
| Memory **diagnosis** | Gap | Adjacent (trace-linked) |

---

## Ranked roadmap (deduped across all 8 agents)

### 🥇 BUILD NOW — highest demand × fit × moat; extends code we already shipped
1. **Tool Reliability Score + public API** — cross-customer success/latency/cost/error-taxonomy per tool & MCP server. The "credit rating." → [`specs/01-tool-reliability-score.md`](./specs/01-tool-reliability-score.md)
2. **Tool regression / "Downdetector" alerts** — fire when a tool degrades across the network; catch rug-pulls / silent version drift. → [`specs/02-tool-regression-alerts.md`](./specs/02-tool-regression-alerts.md)
3. **Tool-description quality scoring** — 97.1% of MCP tool descriptions have quality issues; agents fail on bad metadata, not bad models; *nobody audits this*. → [`specs/03-tool-description-quality.md`](./specs/03-tool-description-quality.md)
4. **Quality-ranked discovery / Anthropic Tool-Search reranker** — slot above the quality-blind Tool Search; ride its GA distribution. → [`specs/04-tool-search-reranker.md`](./specs/04-tool-search-reranker.md)

### 🥈 BUILD NEXT — strong demand, good fit, more lift
5. **"Eval a tool before you adopt it" / shadow-replay tool swaps** — replay past traces against a candidate (`shadowReplay.ts` + `swapRecommendations.ts` are half-built).
6. **Cost-per-task attribution + soft budget guardrails** — per agent/customer/tool; generalize `tracesUsedThisMonth` + cost-spike webhook.
7. **No-progress loop detection** — repeated identical tool calls; there's an open LangChain feature request for "progress-aware termination."
8. **Silent-failure / cascade + handoff-integrity detection** — "status: ok but wrong"; diff handoff payloads (MAST's 74%). Heavier — needs trace-graph analysis.

### 🥉 ADJACENT / LATER
9. Untrusted-MCP-tool **trust score** (pairs with #1)
10. Production-trace → **DSPy/GEPA optimization export**
11. Telemetry-derived **least-privilege** tool recommendations
12. **Memory-impact attribution** (link memory read/write to downstream outcome)

### 🚫 DON'T BUILD
- **Deep eval / LLM-judge platforms** (Braintrust/Galileo/Arize own it; OpenAI owns Promptfoo). Feed our data into judges; don't be one.
- **Inline routing gateway / hard blocking** (OpenRouter $1.3B, Bifrost, Portkey). We're async (Redis ingest), **not in the request path** → we do *soft*/advisory enforcement, not inline blocking.
- **Agent-memory storage** (Mem0/Letta/Zep funded). Memory-impact *attribution* is ours; storage is not.
- **Generic tracing dashboards** (commoditized; Langfuse is free).

---

## Positioning

> **"The neutral reliability & trust layer for the agent tool ecosystem — a credit rating for AI tools, powered by real cross-customer telemetry."**

Observability = the **data flywheel**. The runtime API + MCP server = **distribution**. Pooled cross-customer scores = **the moat** (every customer improves the scores for all).

## Honest risks
1. **Platform risk** — Anthropic could add quality signals to Tool Search. *Counter:* anchor on pooled cross-customer data (they can't aggregate neutrally) and stay model-neutral.
2. **Cold-start** — cross-customer scores need volume. *Counter:* seed aggressively (Firecrawl `mcpCatalogSync`); single-customer regression detection works day 1.
3. **Async architecture** — no inline hard enforcement. *Counter:* position as advisory/soft; partner with gateways.
4. **Willingness-to-pay unproven.** Research proves the *problem* is hot, not that customers pay *us* for *this*. **Run the `VALIDATION_SCRIPT.md` interviews before over-building.**

## Sourcing caveat
Some primary pages (arXiv, vendor blogs, G2, HN/Reddit) returned 403 to the research fetchers; a few precise figures come from cross-checked secondary coverage and search-snippet paraphrases (flagged in the per-angle notes). Confirm exact quotes/numbers from source URLs before external use.
