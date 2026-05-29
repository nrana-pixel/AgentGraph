# Landing-Page Feature Audit

Verifies every feature claimed on the marketing landing page (`apps/landing/app/page.tsx`)
against what is actually implemented in the codebase. Last verified 2026-05-28 on `main`.

**Legend**
- ✅ **Built** — implemented and matches the claim.
- ⚠️ **Partial / Different** — something exists, but the shape, scope, or numbers differ from the claim.
- ❌ **Not built** — aspirational marketing; no code backing it.

**Headline finding:** the landing page is largely *aspirational*. Core tracing, cost
attribution, the recommendation engine, billing quota, and OpenAI/Anthropic
auto-instrumentation are real. But the SDK API shown, OTLP export, Python SDK, tool-swap
recommendations with GitHub PRs / shadow mode, metered span billing, redaction, multi-warehouse
export, and most of the changelog are **not implemented**.

---

## 1. SDK section ("04 — SDK")

| Claim | Status | Evidence / reality |
|---|---|---|
| Auto-instruments OpenAI & Anthropic SDKs | ✅ | `packages/sdk/src/instrumentation/openai.ts`, `anthropic.ts` |
| TypeScript **+ Python** today; Go next month | ⚠️/❌ | TS only. No `.py` files in `packages/sdk`. Python/Go are aspirational. |
| API shown: `ag.trace("checkout-agent", async (t) => …)`, `t.step("retrieve", () => …)`, `t.tool(…)` | ❌ | Real API differs: `ag.trace({ agentId })` takes an **options object, no callback** (`index.ts:15`); `trace.step(type, name, fn)` is **3-arg, type required** (`trace.ts:34`); there is **no `t.tool()` method**; you call `trace.flush()` manually. |
| curl `POST https://agentgraph.dev/v1/spans` | ❌ | Real endpoint is **`/v1/ingest`** (`client.ts:15`) and it accepts a whole trace payload with a `steps[]` array — not individual spans. |
| Captures inputs, outputs, tool args & results — **redact what you need** | ⚠️ | Capture via `Span.setInput/setOutput` is real; **no redaction feature** exists. |
| OTLP export to Datadog, Honeycomb, or your own collector | ❌ | No OTLP exporter. SDK posts JSON to its own `/v1/ingest`. "OpenTelemetry-style" is only a tagline in `package.json` description. |
| Self-host on a single VM. No Kafka, no Cassandra | ⚠️ | A dev `docker-compose` exists, but there's no productized self-host (no Helm chart, no docs). |

---

## 2. Trace section ("01 — TRACE")

| Claim | Status | Evidence / reality |
|---|---|---|
| Span-level trace of the agent loop | ✅ | `Trace`/`Span` classes; `steps[]` captured per trace. |
| Captured: inputs · outputs · prompts · completions · tool args · results · errors | ✅ | `Span` setters + `setError`. |
| Nested span tree with parent/child latency | ⚠️ | `steps` is a **flat array** in the ingest payload; no parent/child nesting in the SDK. |
| Pricing per call, attributed to agent · session · tenant | ✅ | Cost summed in `flush()`; trace carries `agentId`/`sessionId`/`userId`. |
| Exports OTLP → Datadog · Honeycomb · Grafana · file | ❌ | Not built (see SDK row). |

---

## 3. "Anatomy of a span" (12 fields)

| Claim | Status | Reality |
|---|---|---|
| `name`, `kind`, `status`, `model`, `tokens`, `cost_usd`, `latency`, `prompt`, `completion`, `attributes`, `error` | ✅ | All map to `Span` / `TraceStepInput`. |
| `parent_id` (e.g. `span_01_retrieve`) | ⚠️ | No parent linkage in the flat `steps[]` model — nesting is illustrative. |

---

## 4. Cost section ("02 — COST")

| Claim | Status | Evidence / reality |
|---|---|---|
| Price every token at the model's **live rate** | ⚠️ | Pricing is a **static table** (`apps/api/src/lib/modelCosts.ts`, "Refresh monthly"), not live. |
| Sum tool fees; attribute to agent/session/customer | ✅ | Costs summed across steps; attributed. |
| Rollups per agent · session · customer · model · day | ✅ | Cost Explorer (daily spend, model/agent breakdown) is built. |
| Alert: **webhook on trace ≥ threshold** | ⚠️ | Cost-spike webhook fires, but the threshold is **hardcoded at $1.00** (`ingestConsumer.ts:168`), not user-configurable. |
| Alert: daily digest | ❌ | Not built. |
| Alert: hard cap | ⚠️ | Plan-quota returns `402` (`ingest.ts`), but that's a trace-count cap, not a configurable cost cap. |
| Pipe to S3 · BigQuery · Snowflake · Postgres | ❌ | Only Postgres (the app DB itself). No export pipe to warehouses/object storage. |
| Models: OpenAI · Anthropic · Mistral · Together · Groq · Bedrock | ⚠️ | Pricing table covers OpenAI, Anthropic, Google/Gemini, Llama, Mistral by **model name**. Together/Groq/Bedrock are hosts of those same models (match by name); no Cohere. |

---

## 5. Recommend section ("03 — RECOMMEND") — largest gap

| Claim | Status | Evidence / reality |
|---|---|---|
| Score every **tool call** against alternatives **in your registry** | ❌ | Real engine recommends tools for a **task query** from the 83-tool **seeded catalog** (`recommendationEngine.ts`). It does **not** analyze your traces to find swaps for tools you already use. |
| Scores: fit · latency · cost · reliability · region | ⚠️ | Real score = successRate 40% + latency 20% + popularity 25% + sentiment 15%. **No schema-fit, no region scoring** (data residency is a hard filter, not a score), cost not in the formula. |
| Output: side-by-side compare, in-app swap, or **GitHub PR** | ❌ | There's a recommendations form + results list. No swap action, **no GitHub PR generation**. |
| Guardrails: shadow mode → traffic split → cutover | ❌ | None of these exist (`grep` for shadow/traffic-split/cutover hits only landing/CSS). |
| The "stripe.charge → finch.payments, 0.97 fit, Open PR" visual | ❌ | Fictional demo; `finch` appears only in the landing page. |

---

## 6. Principles section — accurate to the architecture

| Claim | Status | Reality |
|---|---|---|
| Never rewrite your prompts | ✅ | No prompt editing anywhere. |
| Never route your model calls / no proxy | ✅ | True — SDK posts out of band to `/v1/ingest`; never in the request path. |
| Never train on your data | ✅ (policy) | Consistent with the architecture; not a code-verifiable claim. |

---

## 7. Pricing section

| Claim | Status | Evidence / reality |
|---|---|---|
| Free: **1M spans/month**, 7-day retention | ❌ | Real free limit is **10,000 traces/month** (`ingest.ts: PLAN_TRACE_LIMITS`). Counts **traces, not spans**; no retention logic. |
| Scale: **$0.10 / 1K spans** | ❌ | No metered/usage billing. Stripe is Phase 5 (pending). |
| SSO & SCIM | ❌ | Pending (Phase 5: SSO/SAML). |
| Recommendations + GitHub PRs | ⚠️ | Recommendations yes; GitHub PRs no. |
| Self-host (single VM) | ⚠️ | Dev docker-compose only. |

---

## 8. FAQ section

| Claim | Status | Evidence / reality |
|---|---|---|
| Disable storage / redact fields / hash inputs at the SDK | ❌ | No redaction/hashing/storage-toggle in the SDK. |
| EU data stays in EU | ❌ | No region/residency routing logic. |
| OTLP-export to LangSmith | ❌ | No OTLP. |
| Self-host: single **Postgres + Clickhouse**, Helm chart + docker-compose | ⚠️ | Postgres yes; **no Clickhouse** (Postgres only); **no Helm chart**; dev docker-compose yes. |
| Cost attribution: OpenAI, Anthropic, Mistral, Groq, Together, Bedrock, Vertex/Gemini, Azure OpenAI, Cohere | ⚠️ | Table has OpenAI, Anthropic, Gemini, Llama, Mistral. **No Cohere**; Azure/Bedrock/Vertex only via model-name match. |
| Auto-instrument OpenAI & Anthropic | ✅ | Built. |
| Not in your request path | ✅ | True. |
| Spans **queue locally** if AgentGraph is down | ❌ | No local buffer/disk queue/retry; `flush()` throws on failure. |
| Exceeding free tier doesn't break ingestion | ❌ | Over-quota returns **`402` and stops ingesting** (`ingest.ts`), contradicting "nothing breaks." |

---

## 9. Changelog ("Recent ships") — none are in the code

| Entry | Status |
|---|---|
| v0.4.2 Span-level OTLP export | ❌ Not built |
| v0.4.1 Recommendations: shadow mode | ❌ Not built |
| v0.4.0 Tool registry & GitHub PRs | ❌ Not built |
| v0.3.7 Python SDK | ❌ Not built |

---

## 10. Other marketing elements

| Element | Status | Note |
|---|---|---|
| Integrations strip (Bedrock, Groq, Together, Datadog, Honeycomb, Grafana, Clickhouse, S3, BigQuery) | ❌/⚠️ | Only OpenAI/Anthropic (instrumentation) and Postgres (DB) are real. |
| Hero/status metrics ("38ms p50 ingest", "4.2M spans/day", live counters) | ❌ | Demo numbers generated client-side in `LandingClient.tsx`; not real telemetry. |

---

## Summary

**Real and shipped:** trace/span capture, OpenAI & Anthropic auto-instrumentation, per-call cost
attribution from a static pricing table, Cost Explorer rollups, an 83-tool catalog with a
task-based recommendation engine, plan-quota enforcement (402), and a hardcoded cost-spike webhook.

**Marketing-only (no code):** the SDK call shapes shown, `/v1/spans`, Python/Go SDKs, OTLP export,
Datadog/Honeycomb/Grafana/Clickhouse/S3/BigQuery integrations, tool-swap recommendations with
schema-fit/region scoring, GitHub PRs, shadow mode, span-based metered billing, SSO/SCIM, redaction,
EU residency, local span queueing, and all four changelog entries.

The biggest factual mismatches a prospective user would hit immediately:
1. **SDK API in the code samples doesn't match the real SDK** (no `t.tool()`, options-object `trace()`, `/v1/ingest` not `/v1/spans`).
2. **Pricing is "spans" on the page but "traces" in code**, and free is 10k traces, not 1M spans.
3. **"Recommend"** is task-based catalog search, not trace-driven tool swaps with PRs.
4. **"Nothing breaks over the free tier"** is contradicted by the 402 hard stop.
