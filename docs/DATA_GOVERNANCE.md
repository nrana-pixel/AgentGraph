# Data Governance — Shared Tool Telemetry

AgentGraph's tool intelligence is powered by **anonymized, cross-organization
telemetry**: when many orgs use a tool, their aggregate success rate, latency,
and popularity become the benchmark that ranks that tool for everyone. This is
the product's data flywheel — and also the thing enterprises ask about first.
This document is the answer.

## What is pooled

Only **derived, per-day aggregates** of tool behaviour enter the shared pool —
never raw traces, inputs, outputs, prompts, or any customer payload.

The shared `tool_global_stats` table is computed from `tool_stats`, which holds
per-tool, per-project, per-day **counts and percentiles**:

| Pooled (aggregate) | NOT pooled |
|---|---|
| Tool slug (e.g. `stripe`) | Trace inputs / outputs |
| Call count, success/error counts | Prompts, completions |
| Avg / p95 latency | User, session, or agent IDs |
| Derived success rate, popularity | Org / project identity |

`tool_global_stats` is keyed by tool slug alone. It carries **no project_id and
no org_id** — it is not possible to attribute a global benchmark back to a
specific customer.

## Opt-out

Each organization has a `share_anonymized_stats` flag (default **true**).

- **Opted in:** the org's aggregates contribute to `tool_global_stats`, and the
  org benefits from the full cross-org benchmark in discovery/recommendations.
- **Opted out:** the org's data is **excluded from the shared pool** entirely
  (enforced in `statsAggregator.ts` via a join on `organizations.share_anonymized_stats`).
  The org still gets:
  - its **own** per-project tool stats (`tool_stats`, `tool_usage_stats`), and
  - discovery ranking from the seeded catalog + its own history.

Opting out never deletes or degrades an org's private analytics — it only
removes its contribution to (and is independent of its consumption of) the
shared benchmark.

## Recommended defaults

| Plan | Default | Rationale |
|---|---|---|
| Free | opted **in** | Fair exchange: free tier feeds the flywheel it benefits from. |
| Pro / Team / Enterprise | configurable | Paid customers control their data posture; surface the toggle in Settings. |

## Implementation references

- Flag: `organizations.shareAnonymizedStats` (`apps/api/src/db/schema.ts`)
- Enforcement: per-tool CTE join in `apps/worker/src/crons/statsAggregator.ts`
- Anonymity: `tool_global_stats` has no tenant columns (`schema.ts`)

## Open items (before enterprise GA)

- [ ] Expose the toggle in the dashboard Settings page + `PATCH /v1/projects/:id` (org-scoped).
- [ ] Add a minimum-k anonymity threshold (suppress a global stat until ≥ N distinct orgs contribute) to prevent single-org inference.
- [ ] Document retention windows for `tool_stats`.
