# AgentGraph — What To Do Next

**Status:** strategic roadmap, drafted 2026-05-29.
**Owner:** @nrana-pixel
**One-line thesis:** Stop being "another LLM observability tool." Become the **tool-selection / routing layer for MCP-era agents**, and use observability purely as the data flywheel that powers it.

---

## 0. Why we're changing direction

The codebase today is ~80% LLM observability (traces, cost explorer, dashboards) and ~20% tool intelligence (the recommendation engine). The observability market is crowded and commoditizing — Langfuse (free, OSS, MIT) is the default, and Datadog/Honeycomb own the enterprise. Feature parity there is **not a wedge**.

The differentiator — *"which tool should the agent use, ranked by real-world performance?"* — points at a validated, acute pain:

- Tool definitions can consume **up to 72% of an agent's context window**.
- Tool-selection accuracy **drops ~3x** with bloated toolsets; degradation starts at ~5+ tools.
- The MCP registry crossed **9,400+ servers** by April 2026.
- Anthropic donated MCP to a vendor-neutral foundation (Dec 2025) — it's now the standard.

**The move:** flip the ratio. Lead with tool intelligence. Make observability the acquisition channel and the data source, not the headline.

### What we keep (already strong, don't rebuild)
- Async ingest → Redis queue → worker → nightly aggregation pipeline.
- Security hardening (SSRF guard, AES-GCM secrets at rest, identity isolation, role gating).
- OTLP + warehouse export (lets us position as "complementary, not rip-and-replace").
- Seeded→telemetry "graduation" + cold-start score cap (the right instinct on data trust).

---

## 1. The core reframe: from leaderboard to task-fit routing

### Problem with the current engine
`recommendationEngine.ts` computes a **global leaderboard**:

```
score = successRate×40% + latency×20% + popularity×25% + sentiment×15%
```

That answers *"what's the best email tool overall?"* But an agent's real question at runtime is:

> "Given THIS task, in THIS context, out of the tools I can actually call — which one, and what's its schema?"

That's a **retrieval + task-fit + schema-fit** problem, not a popularity chart. The fix has three parts (Workstreams A, B, C below).

---

## 2. Workstreams (in priority order)

### ⭐ Workstream A — Runtime MCP discovery endpoint (HIGHEST LEVERAGE)
**Goal:** put AgentGraph in the agent's inference critical path. The agent asks "what can do X?" and gets back a small, ranked set of tools **plus their schemas**, so it never has to load 9,400 tool definitions into context.

**Deliverable:** a new API endpoint + an MCP-server wrapper.

- [ ] `POST /v1/discover` (new route `apps/api/src/routes/discover.ts`, mount in `index.ts`)
  - Input: `{ task: string, availableTools?: string[], limit?: number, context?: string }`
  - Output: top-N tools with `slug`, `name`, **`inputSchema`/`outputSchema`** (already columns in `tools`), `score`, `reason`.
  - `availableTools` filters to only the tools this agent has access to — critical: we rank *within the agent's actual toolset*, not the whole catalog.
  - Reuse `flexAuth` + `rateLimiter`. Cache per (task, toolset) in Redis (we already cache recommendations 5 min).
- [ ] Expose it as an **MCP server** so any MCP-compatible agent gets 1 "discovery" tool instead of 9,400 tool defs (the "MCP Wrapper Pattern"). New package: `packages/mcp-server/`.
  - Tools exposed: `search_tools(task)`, `get_tool_schema(slug)`. That's it — keeps the agent's context tiny.
- [ ] SDK helper: `ag.discover(task, { availableTools })` in `packages/sdk/` so non-MCP users get it too.

**Success criteria:** an agent with 200 tools available calls `search_tools("send a transactional email")` and gets 3 ranked candidates + schemas in < 200ms, using < 1k tokens of context instead of tens of thousands.

---

### ⭐ Workstream B — Task-fit + schema-fit scoring (makes A actually smart)
**Goal:** rank by relevance to the task and fit to the agent's data, not just global popularity.

- [ ] **Semantic task→tool matching.** Today `recommendationEngine.ts` uses Postgres FTS (`plainto_tsquery`). Add embeddings:
  - Add `pgvector` (new migration), an `embedding vector` column on `tools`, embed `name + description + tags` on tool upsert.
  - Rank candidates by cosine similarity to the task embedding; keep FTS as a cheap pre-filter / fallback.
- [ ] **Schema-fit scoring.** We already have `inputSchema`/`outputSchema` on `tools` and a `swapRecommendations.ts` service that scores "schema fit." Promote that logic into the discovery path so a tool whose input matches what the agent already has scores higher.
- [ ] **Per-org history weighting.** `toolUsageStats` (per-project actual usage) already exists. Blend it in: a tool *this org* has used successfully should outrank a stranger's favorite.

**New scoring shape (proposal):**
```
finalScore = taskRelevance×35%   (semantic + FTS)
           + schemaFit×15%
           + reliability×25%     (successRate, from tool_global_stats)
           + orgHistory×15%      (this project's own toolUsageStats)
           + latency×10%
```
Keep the **cold-start cap** logic — it's good.

**Success criteria:** for a fixed task, the top result changes appropriately when (a) the available-tool set changes and (b) the calling org's own history differs. Write tests in `recommendationEngine.test.ts` covering both.

---

### Workstream C — Cold-start seeding (fix chicken-and-egg)
**Goal:** a brand-new user gets a *useful* answer on day one, before we have any of their telemetry. Coverage matters more than telemetry depth right now (83 seeded tools vs 9,400+ MCP servers).

- [ ] **Crawl the MCP registry** → upsert tools with `dataSource: "seeded"`, capture input/output schemas (MCP servers publish them!), category, description.
- [ ] **Enrich from public signal:** GitHub stars/issues/recency (we already have a `sentimentFetcher` cron — extend it), npm/PyPI downloads.
- [ ] Target: **1,000+ seeded tools with schemas** before any paid launch.
- [ ] Keep the seeded→telemetry graduation (`statsAggregator.ts`, 50-call threshold) — it already does the right thing.

**Success criteria:** `/v1/discover` returns useful, schema-bearing results for the top ~20 task categories with **zero customer telemetry ingested**.

---

### Workstream D — Customer validation (DO THIS IN PARALLEL, BEFORE building too much)
**Goal:** confirm people will pay before we over-invest. This can kill or redirect the whole plan — run it now.

- [ ] Interview **10–15 teams running agents in production.**
- [ ] Core question: *"When your agent picks the wrong tool, what does it cost you — and would you pay to fix it?"*
- [ ] Probe: *"How do you pick tools today?"* If the answer is overwhelmingly "we just hardcode them," that's a **critical signal** → pivot toward eval/debugging instead of runtime routing.
- [ ] Script lives in `docs/VALIDATION_SCRIPT.md` (to be written).

**Success criteria:** ≥ 5 of 15 describe a concrete, recurring pain around tool selection AND express willingness to pay. If not, stop and reconsider before Workstream A ships.

---

### Workstream E — Data-governance / trust story (sales unblocker)
Pooling cross-org telemetry is both the **moat** and a **deal-blocker** for enterprises. Get ahead of it.

- [ ] Write a clear data-policy doc: what's pooled, how it's anonymized, opt-out.
- [ ] Add an org-level `shareAnonymizedStats` flag (default opt-in for free tier, opt-out for paid) — orgs that opt out still get seeded + their own telemetry.
- [ ] Make sure `tool_global_stats` aggregation can never leak per-org identity (audit `statsAggregator.ts`).

---

## 3. Explicitly NOT doing right now
- No new dashboard polish. Don't out-feature Datadog on cost-explorer UI.
- No Stripe/billing build-out (Phase 5) until the wedge is validated.
- No SSO/SAML until an enterprise deal demands it.
- No new framework integrations beyond what unblocks Workstream A (MCP first).

---

## 4. Suggested sequence

```
Week 0      Workstream D (validation) kicks off — runs in background
Week 1–2    Workstream A: /v1/discover endpoint + SDK helper
Week 2–3    Workstream C: MCP registry crawl → 1,000+ seeded tools w/ schemas
Week 3–4    Workstream A: MCP-server wrapper (packages/mcp-server)
Week 4–5    Workstream B: pgvector + task-fit + schema-fit + org-history scoring
Week 5      Workstream E: data-governance doc + opt-out flag
Week 6      Re-evaluate against validation findings; decide GTM
```
Gate: if Workstream D comes back negative, pause A–C and revisit thesis.

---

## 5. First concrete tickets (start here)

1. **`docs/VALIDATION_SCRIPT.md`** — 10-question interview script + target list. (Workstream D)
2. **`POST /v1/discover` skeleton** — route + Zod schema in `@agentgraph/types` + reuse current engine, `availableTools` filter, Redis cache. (Workstream A)
3. **MCP registry crawler** — new worker cron `crons/mcpCatalogSync.ts` that upserts tools + schemas. (Workstream C)
4. **pgvector migration + embedding column** on `tools`. (Workstream B)

---

## Appendix — key files this plan touches
| Area | File |
|---|---|
| Recommendation scoring | `apps/api/src/services/recommendationEngine.ts` |
| Schema-fit / swap logic | `apps/api/src/services/swapRecommendations.ts` |
| DB schema (tools, schemas, usage stats) | `apps/api/src/db/schema.ts` |
| Nightly aggregation + graduation | `apps/worker/src/crons/statsAggregator.ts` |
| Sentiment / public-signal cron | `apps/worker/src/crons/sentimentFetcher.ts` |
| Ingest entry (data flywheel) | `apps/api/src/routes/ingest.ts` |
| SDK client (add `discover`) | `packages/sdk/src/client.ts`, `index.ts` |
| Shared types (add discover schema) | `packages/types/src/tool.ts` |

## Appendix — market sources
- LLM observability market ~$2.69B (2026) → ~$9.26B (2030), ~36% CAGR — Research and Markets
- Gartner: observability attached to 50% of GenAI deployments by 2028 (from ~15%)
- MCP context overload: up to 72% of context consumed by tool defs; ~3x accuracy drop — EclipseSource, MintMCP
- MCP registry 9,400+ servers (Apr 2026); MCP donated to vendor-neutral foundation (Dec 2025)
- Research on dynamic discovery: MCP-Zero, Dynamic ReAct (arXiv)
