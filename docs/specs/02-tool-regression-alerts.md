# Spec 02 — Tool Regression "Downdetector" Alerts

**Status:** proposed · **Effort:** M · **Priority:** 🥇 build-now (after 01)

## Goal
Detect when a tool/MCP server **degrades across the network** — success-rate drop, latency spike, cost spike, or a silent **description/version "rug-pull"** — and alert affected projects via the existing webhook system. This is the "Downdetector / status page for AI tools," and it's the feature the eval agent named the **unbuilt whitespace**: everyone monitors *their own* tool error rate; nobody answers *"is this tool regressing for everyone?"*

## Why
- Eval agent: cross-org tool regression detection is *"unbuilt — exactly AgentGraph's data shape."*
- MCP/security agents: **rug-pulls** (a server mutates its tool description/behavior post-approval) and version regressions are a named, unsolved MCP risk (9/11 registries poisoned in a PoC).
- Doubles as marketing: a public "tool status" surface drives inbound.

## Data model
Two needs: **history** (to compute deltas) and **definition fingerprints** (to catch rug-pulls).

1. `tool_global_stats_history` (new table) — daily snapshot written by the aggregator:
   ```ts
   { id, toolSlug, date, successRate, p95LatencyMs, costPerCallUsd, totalCalls, distinctOrgs }
   // unique (toolSlug, date); index (toolSlug, date)
   ```
2. `tools.definitionHash` (new column) — `sha256(name + description + JSON.stringify(inputSchema))`, recomputed on every catalog sync / auto-discovery. Changing hash = the tool's contract changed.

Mirror schema in worker. `npm run db:generate`.

## Detection (nightly, in `statsAggregator.ts` after global stats are fresh)
For each tool with `distinctOrgs >= K` (min-k from spec 01):
- **Reliability regression:** `successRate` drop ≥ `REGRESSION_DELTA` (start 0.08 = 8 pts) vs the trailing 7-day median in `_history`.
- **Latency regression:** `p95LatencyMs` up ≥ 50% vs trailing median.
- **Cost regression:** `costPerCallUsd` up ≥ 50% vs trailing median.
- **Rug-pull:** `definitionHash` changed AND a reliability/latency regression appeared within 48h of the change.
Guardrails: require a minimum sample (`totalCalls >= 50` in the window) so noise doesn't page anyone.

Keep the threshold logic in a **pure, unit-tested** helper (`detectRegression(current, history): Regression[]`).

## Delivery (reuse existing webhook plumbing)
- Add `"tool_regression"` to the allowed `webhooks.events` enum (currently `cost_spike | error_rate_threshold | trace_completed`).
- Fire via the worker's `deliverSignedWebhooks(db, projectId, "tool_regression", payload)` (`signedWebhookDelivery.ts`) — same HMAC signing as cost-spike. **Only notify projects that actually called the regressed tool** (join `tool_stats`/`tool_usage_stats` by `toolSlug`).
- Payload:
  ```json
  {
    "event": "tool_regression",
    "toolSlug": "stripe",
    "kind": "success_rate" | "latency" | "cost" | "rug_pull",
    "current": { "successRate": 0.86, "p95LatencyMs": 1400 },
    "baseline": { "successRate": 0.97, "p95LatencyMs": 600 },
    "windowDays": 7,
    "suggestedAlternative": "<best same-category tool by reliabilityScore>",
    "timestamp": "..."
  }
  ```
- `suggestedAlternative` reuses `swapRecommendations` / the recommendation engine — turns an alert into an action ("switch to Y").

## API / surface
- `GET /v1/tools/:slug/health` → current status (`healthy | degraded | regressed`) + last regression event + 30-day sparkline from `_history`.
- (Optional) public status board in `apps/web`.

## Implementation steps
1. `tool_global_stats_history` table + `tools.definitionHash` + migration (mirror worker).
2. Write history snapshot at end of `statsAggregator.ts`; compute `definitionHash` in `mcpCatalogSync.ts` and the ingest auto-discovery path (`ingestConsumer.ts`).
3. `detectRegression()` pure helper + tests; call it in the aggregator.
4. Extend webhook events enum + fire `tool_regression`; scope to affected projects.
5. `GET /v1/tools/:slug/health` + types.

## Success criteria
- Seeded fixture where a tool's success rate drops 10 pts → exactly the projects that used it receive one signed `tool_regression` webhook with a sane `suggestedAlternative`.
- A description change with no perf change is recorded (hash) but does **not** page (avoids false positives).
- Min-k + sample guardrails prevent alerts on thin data.

## Out of scope
Inline/real-time blocking (we're async). This is detect-and-notify (+ advisory swap), not enforcement.
