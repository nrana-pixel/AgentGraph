# Spec 03 — Tool-Description Quality Scoring

**Status:** proposed · **Effort:** S · **Priority:** 🥇 build-now (cheapest win)

## Goal
Score every tool/MCP server's **description + input schema quality** (0–100) and surface concrete issues. Agents misfire because of *bad tool metadata, not bad models* — and **almost nobody audits this**. We already store the metadata, so this is a near-zero-effort, zero-competition addition that strengthens the reliability/trust layer.

## Why
- Practitioner agent: *"97.1% of MCP tool descriptions contain at least one quality issue"*; agents "invent plausible-sounding tools" and "misfire based on partial matches" when descriptions are vague or near-duplicate (`get_status` vs `fetch_status` vs `query_status`).
- It's a leading indicator of selection failure that's independent of call volume → **works on day 1, no telemetry needed** (helps cold-start).

## Data model (`tools` table + migration; mirror worker)
```ts
descriptionQualityScore: integer("description_quality_score"), // 0–100, null = not yet scored
qualityIssues: text("quality_issues"), // JSON string[] of issue codes
qualityCheckedAt: timestamp("quality_checked_at", { withTimezone: true }),
```

## Scoring — heuristics first, optional LLM second
Pure, unit-testable `scoreToolDescription(tool): { score, issues[] }`. Issue codes (each deducts):
- `too_short` — description < 20 chars / missing.
- `no_verb` — doesn't start with an action verb (can't tell what it *does*).
- `vague` — only generic words ("handles data", "manages things").
- `missing_input_schema` — `inputSchema` null/empty.
- `untyped_params` — schema properties without `type`.
- `no_param_descriptions` — schema properties without `description`.
- `name_collision` — name is a near-duplicate (token-overlap ≥ 0.8) of another tool in the same category (the `*_status` problem).
- `placeholder` — contains "TODO", "example", "lorem", "your description here".

Score = `100 - Σ weights`, clamped 0–100. Keep weights in one table at the top of the file.

**Optional LLM pass** (gated on `EMBEDDING_API_KEY`/an LLM key, same pattern as `lib/embeddings.ts`): for tools below a heuristic threshold, ask an LLM for a 0–100 clarity rating + a one-line suggested rewrite stored in `qualityIssues`. Degrades gracefully to heuristics-only when unconfigured.

## Where it runs
New worker cron `apps/worker/src/crons/toolQualityScan.ts` (daily, e.g. 00:30 UTC, before embedding backfill at 01:00):
- Select tools where `qualityCheckedAt` is null or older than `definitionHash` change (reuse the hash from spec 02 so we only re-score changed tools).
- `name_collision` needs the category cohort → load same-category names in one query per category.
- Batch; bound per run (e.g. 2,000 tools).

Also run inline on `mcpCatalogSync` upsert so freshly-crawled tools get a score immediately.

## Surface
- Add `descriptionQualityScore` + `qualityIssues` to `GET /v1/tools`, `GET /v1/tools/:slug`, and `DiscoveredTool` (so discovery can *down-rank* poorly-described tools and the dashboard can flag them).
- Optionally factor a small weight into discovery task-relevance: a tool the model can't understand shouldn't rank high even on a keyword match.

## Implementation steps
1. Schema columns + migration (mirror worker).
2. `scoreToolDescription()` pure helper + tests (cover each issue code).
3. `toolQualityScan.ts` cron + schedule in `apps/worker/src/index.ts`; inline call in `mcpCatalogSync.ts`.
4. Extend API/types/discovery payloads.

## Success criteria
- A vague/short/placeholder description scores low with the right issue codes; a clear, typed, well-described tool scores ≥ 90.
- The `*_status` near-duplicate trio each get `name_collision`.
- Runs with zero telemetry (cold-start safe) and re-scores only changed tools on subsequent runs.

## Out of scope
Rewriting descriptions automatically (we *suggest*, we don't mutate third-party tool metadata).
