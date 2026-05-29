# Spec 01 — Tool Reliability Score + Public API

**Status:** proposed · **Effort:** M · **Priority:** 🥇 build first (00 of the build-now tier)

## Goal
Turn the raw cross-customer stats we already aggregate into a single, defensible **Reliability Score (0–100)** per tool/MCP server — plus an error taxonomy, cost-per-call, and a freshness/coverage signal — and expose it via a public, model-neutral API. This is the "credit rating for AI tools": the moat artifact everything else (02 regression alerts, 04 reranker, discovery) consumes.

## Why
- Across all 8 research angles, the empty seat is *"which tool actually works, ranked by evidence."* The competitor matrix had **zero** platforms with telemetry-backed tool quality scoring.
- It's defensible: a meaningful cross-customer score **requires pooled data** a single-tenant competitor can't compute.

## Data model (`apps/api/src/db/schema.ts` → migration via `npm run db:generate`)
Extend `toolGlobalStats` (currently: `toolSlug` PK, `totalCalls`, `successRate`, `avgLatencyMs`, `p95LatencyMs`, `popularityScore`, `lastUpdated`):

```ts
reliabilityScore: numeric("reliability_score", { precision: 5, scale: 2 }), // 0–100
costPerCallUsd:  numeric("cost_per_call_usd", { precision: 12, scale: 6 }),
errorTaxonomy:   text("error_taxonomy"),   // JSON: { timeout: n, auth: n, rate_limit: n, schema: n, "5xx": n, other: n }
distinctOrgs:    integer("distinct_orgs").default(0).notNull(), // for min-k anonymity (see Privacy)
gradeBand:       text("grade_band"),       // 'A'|'B'|'C'|'D'|'F' — human-readable bucket
```
Mirror in `apps/worker/src/db/schema.ts`.

## Scoring
Compute in the nightly aggregator (`apps/worker/src/crons/statsAggregator.ts`), after `tool_global_stats` is re-derived. Reuse the spirit of `recommendationEngine.computeScore` but framed as *reliability*, not task-fit:

```
reliabilityScore = successRate×50%        (from successCount/callCount)
                 + latencyScore×20%       (100 - p95/categoryP95Median*50, clamped)
                 + consistency×15%        (1 - variance of daily success rate over trailing 14d)
                 + adoption×15%           (log-normalised distinctOrgs, NOT raw call volume)
```
- **Cold-start cap** stays: `< 50 calls` → cap 70, `data_source` shows `seeded`. (Matches existing graduation logic.)
- `errorTaxonomy` is derived by bucketing `trace_steps.error` strings (regex map) during the per-project rollup.
- `costPerCallUsd` = `SUM(cost_usd)/callCount` from `tool_stats`.

## Privacy / min-k anonymity (important)
A "global" score for a niche tool used by one org would leak that org's numbers. **Do not publish a score unless `distinctOrgs >= K` (start K=3).** Below K, return `score: null, status: "insufficient_data"`. Also honor `organizations.shareAnonymizedStats` (already enforced in the aggregator) — opted-out orgs don't count toward `distinctOrgs` or the pooled numbers. See `../DATA_GOVERNANCE.md`.

## API (`apps/api/src/routes/tools.ts`, reuse `flexAuth` + `rateLimiter`)
```
GET /v1/tools/:slug/reliability
→ {
    slug, name, category,
    reliabilityScore: number | null,   // null when distinctOrgs < K
    gradeBand: "A".."F" | null,
    successRate, p95LatencyMs, costPerCallUsd,
    errorTaxonomy: { timeout, auth, rate_limit, schema, "5xx", other },
    distinctOrgs, totalCalls,
    dataSource: "seeded" | "telemetry",
    status: "ok" | "insufficient_data",
    lastUpdated
  }
```
Add `reliabilityScore`/`gradeBand` to the existing `GET /v1/tools` list payload and to `DiscoveredTool` so discovery/SDK surface it too. Add Zod schemas to `packages/types/src/tool.ts`.

## Implementation steps
1. Schema columns + `npm run db:generate` (new migration; mirror worker schema).
2. `statsAggregator.ts`: extend the `tool_global_stats` upsert to compute the four sub-scores, `errorTaxonomy`, `costPerCallUsd`, `distinctOrgs`. Add a pure `computeReliabilityScore()` helper in a shared lib so it's unit-testable.
3. Add `GET /v1/tools/:slug/reliability` + extend list/discovery payloads + `@agentgraph/types`.
4. (Optional, marketing) a public read-only leaderboard surface in `apps/web` — high SEO/inbound value.

## Success criteria
- A tool with ≥K orgs and ≥50 calls returns a stable 0–100 score with a populated error taxonomy.
- A single-org or <50-call tool returns `insufficient_data` (no leak, no overconfident score).
- Unit tests on `computeReliabilityScore()` cover cold-start cap, min-k gating, and the latency/consistency terms.

## Out of scope
Per-task ranking (that's discovery/04). This score is *tool-intrinsic* reliability, not task-fit.
