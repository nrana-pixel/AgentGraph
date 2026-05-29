# Build Specs — Tool Reliability & Trust Layer

Implementation-ready specs for the **Build-Now** tier from [`../MARKET_OPPORTUNITIES.md`](../MARKET_OPPORTUNITIES.md). Each is a surgical extension of code we already shipped — not a new product.

| # | Spec | Extends | Effort | Status |
|---|------|---------|--------|--------|
| 01 | [Tool Reliability Score + API](./01-tool-reliability-score.md) | `tool_global_stats`, `statsAggregator.ts`, `routes/tools.ts` | M | proposed |
| 02 | [Tool Regression "Downdetector" Alerts](./02-tool-regression-alerts.md) | `statsAggregator.ts`, webhooks, `signedWebhookDelivery.ts` | M | proposed |
| 03 | [Tool-Description Quality Scoring](./03-tool-description-quality.md) | `tools` table, a new worker cron | S | proposed |
| 04 | [Tool-Search Reranker (Anthropic + `/discover`)](./04-tool-search-reranker.md) | `discoveryEngine.ts`, `routes/discover.ts` | S–M | proposed |

**Shared dependency:** all four read from / write to the cross-customer tool stats. Build **01 first** — it defines the `reliabilityScore` + min-k anonymity that 02 and 04 consume.

**Gate:** none of this should ship to a paid launch before the `../VALIDATION_SCRIPT.md` willingness-to-pay interviews. Build the thin slice, demo it, then validate.

**Conventions** (from `CLAUDE.md`): Drizzle schema is source of truth → `npm run db:generate` after schema edits; model-cost / lib changes mirror across `apps/api` + `apps/worker`; add Zod types to `@agentgraph/types`; tests live next to source (Vitest).
