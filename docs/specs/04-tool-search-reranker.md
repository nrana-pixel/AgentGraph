# Spec 04 — Tool-Search Reranker (Anthropic + `/discover`)

**Status:** proposed · **Effort:** S–M · **Priority:** 🥇 build-now (distribution)

## Goal
Be the **quality layer that sits *above* Anthropic's Tool Search** (and any semantic retriever): take a set of candidate tools selected by lexical/semantic match and **rerank them by real-world reliability** before the agent sees them. This rides Anthropic's GA distribution instead of fighting it, and makes our score actionable at the exact moment of tool selection.

## Why
- MCP agent: Anthropic Tool Search went **GA (Feb 2026), on by default in Claude Code**, cut tool-def tokens 85%+ and raised selection accuracy — but **retrieves on name/description match only; it has zero notion of which tool works.** The docs **support a custom tool-search hook.**
- Competitor agent: the durable angle is being the **neutral quality signal** that feeds the model layer and gateways, not replacing them.
- We already shipped `/v1/discover` + `discoveryEngine` + `@agentgraph/mcp-server` — this is a focused extension.

## Two delivery modes

### Mode A — Rerank an externally-provided candidate list (the Anthropic hook)
New endpoint:
```
POST /v1/rerank
body: {
  task: string,
  candidates: Array<{ slug: string } | { name: string; description?: string }>,
  availableTools?: string[],   // optional intersection
  limit?: number
}
→ { task, ranked: DiscoveredTool[] }   // same shape as /discover, reused
```
- Resolve candidates against the catalog by `slug` (fallback fuzzy-match on `name`). Unknown candidates pass through with `reliabilityScore: null` (don't drop them — the agent still needs them).
- Score with the **existing `discoveryEngine` scoring** but bias toward the *intrinsic* signals (reliabilityScore from spec 01, latency, org-history) since the *retrieval* relevance was already decided upstream.
- Respect min-k: unscored/insufficient-data tools rank after scored ones but are not removed.

### Mode B — First-class discovery (already built)
`/v1/discover` + the MCP server stay the path for agents that want us to do *both* retrieval and ranking. Fold `reliabilityScore` + `descriptionQualityScore` (specs 01, 03) into the discovery score weights.

## Integration artifacts (docs + glue, the high-leverage part)
- A short **"Use AgentGraph as your Claude tool-search backend"** guide in `apps/web/.../docs/` showing the custom tool-search hook calling `POST /v1/rerank`.
- An SDK helper: `ag.rerank(task, candidates, opts)` in `packages/sdk` (mirror `ag.discover`, with the same bounded-retry-no-queue behavior we added).
- Cookbook example for non-Anthropic stacks (OpenAI/Gemini/open models) — the whole non-Anthropic market has **no** server-side equivalent.

## Implementation steps
1. `POST /v1/rerank` route (`apps/api/src/routes/rerank.ts`, mount in `index.ts`); reuse `flexAuth` + `rateLimiter` + the discover Redis cache pattern.
2. `discoveryEngine.rerankCandidates(task, candidates, opts)` — reuse candidate scoring; add a "retrieval already done" weighting profile.
3. `RerankQuery` / `RerankResponse` Zod types in `@agentgraph/types`.
4. SDK `ag.rerank()` + the integration guide + cookbook.
5. Depends on spec 01 (`reliabilityScore`) for the signal worth reranking on.

## Success criteria
- Given 10 candidates for "send a transactional email," the higher-reliability tool ranks above an equally-relevant but flakier one; unknown/low-data candidates still appear (ranked last) and are never silently dropped.
- A copy-paste Claude Code tool-search-hook example returns reranked tools in < 200ms on a warm cache.

## Out of scope
Owning retrieval/discovery for Claude (that's Anthropic's). We are the *reranking quality signal*, model-neutral by design.
