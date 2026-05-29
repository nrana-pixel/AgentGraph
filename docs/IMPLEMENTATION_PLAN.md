# Implementation Plan — Closing the Landing-Page Gap

Concrete, code-grounded steps to implement the features advertised on the marketing
landing page that are not yet built (see `LANDING_PAGE_FEATURE_AUDIT.md`).
Last updated 2026-05-29 on `main`.

Features are grouped into tiers by effort and risk. Each item lists **Goal**,
**What's needed**, **Steps** (with real file paths), **Effort**, and **Risks/Dependencies**.

> Effort key: `S` ≈ hours, `M` ≈ 1–3 days, `L` ≈ 1–2 weeks, `XL` ≈ multi-week.
> Status key: ✅ done · ⬜ todo · ⏸ deferred · ❌ dropped.

---

## Progress (2026-05-29)

Shipped to `main` so far:

| Item | Status | Commit |
|------|--------|--------|
| 0.1 SDK code samples | ✅ | `a197cf4` |
| 0.2 pricing units (spans→traces) | ✅ | `a197cf4` |
| 0.3 FAQ over-quota wording | ✅ | `a197cf4` |
| 1.1 configurable cost-spike threshold | ✅ | `a197cf4` (migration `0002`) |
| 1.2 SDK redaction / hashing | ✅ | `a197cf4` |
| 1.3 SDK local queue + retry | ✅ | `a197cf4` |
| 1.4 expand model pricing | ✅ | `a197cf4` |
| 2.1 Python SDK | ✅ | `15be398` (`packages/sdk-python`) |
| 2.3 daily digest + hard cost cap | ✅ | `15be398` (migration `0003`) |
| 2.2 OTLP export (worker) | ✅ | `d17df39` (migration `0004`) |
| 2.4 warehouse / object-store export | ✅ | (migration `0005`) — S3 done; GCS/BigQuery/Snowflake stubbed (need SDKs+creds) |
| 3.1 trace-driven swap recommendations | ✅ | (migration `0005`) — GitHub-PR half deferred (needs GitHub App + tool registry) |
| 3.5 shadow mode (offline replay, option b) | ✅ | no live routing; cost projection left null (no per-tool benchmark) |

**Remaining:**

1. **3.3 SSO / SCIM** — `L`. Needs a Clerk enterprise plan to verify; implement plan-gating + org/member mapping, flag the config. Only outstanding planned item.

**Follow-ups noted during build (optional):**
- 2.4: implement GCS/BigQuery/Snowflake exporters + parquet format (currently NDJSON→S3 only); verify against live cloud creds.
- 3.1: GitHub-PR generation (blocked on a GitHub App + tool→code registry); persist per-tool input/output schemas so schema-fit scoring isn't mostly null; consider a global cap on swaps returned.

**Out of scope (per product decision 2026-05-29):**
- ⏸ **3.2 Stripe metered billing** — deferred, implement later.
- ❌ **3.4 EU data residency** — dropped, not needed.

Coordination note: each remaining backend item adds a Drizzle migration, so run them **one at a time** (the `meta/_journal.json` + snapshot are shared) — do not parallelize migration-producing agents. Schema lives in two synced copies (`apps/api/src/db/schema.ts` + `apps/worker/src/db/schema.ts`).

---

## Tier 0 — Make the page honest (copy/docs only)

These require no backend work and remove the most damaging factual mismatches.

### 0.1 Fix the SDK code samples — `S`
- **Goal:** Landing code tabs match the real SDK.
- **What's needed:** Edit `apps/landing/app/page.tsx` (`TS_CODE`, `PY_CODE`, `CURL_CODE`).
- **Steps:**
  1. Replace `ag.trace("checkout-agent", async (t) => …)` with the real options-object form: `const trace = ag.trace({ agentId: "checkout-agent", sessionId, userId });`.
  2. Replace `t.step("retrieve", () => …)` / `t.tool(…)` with `trace.step("tool_call", "stripe.charge", async (span) => { … })` (3 args, `StepType` first).
  3. Add the required `await trace.flush();`.
  4. Fix the curl endpoint from `/v1/spans` to `/v1/ingest` and change the body from a single span to an `IngestPayload` (`agentId`, `env`, `status`, `steps[]`).
  5. Until a Python SDK exists (Tier 2.1), either remove the Python tab or label it "coming soon."
- **Risks:** None.

### 0.2 Reconcile pricing units — `S`
- **Goal:** "spans" vs "traces" stops contradicting the code.
- **What's needed:** Either change copy or change the metering unit. Cheapest: change copy.
- **Steps (copy route):** In `apps/landing/app/page.tsx` pricing + hero, change "spans" → "traces"; set Free to **10,000 traces/month** to match `PLAN_TRACE_LIMITS` in `apps/api/src/routes/ingest.ts:13`.
- **Risks:** If product genuinely wants span-based billing, do Tier 3.2 instead.

### 0.3 Fix the FAQ over-quota claim — `S`
- **Goal:** Remove "nothing breaks over the free tier" contradiction with the `402` hard stop.
- **What's needed:** Either soften the copy or implement soft-limit behavior.
- **Steps (copy route):** Reword the FAQ to "you'll get a 402 and an email; opt into billing to continue." (Soft-limit behavior is Tier 3.2.)
- **Risks:** None.

---

## Tier 1 — Easy wins (infrastructure already exists)

### 1.1 Configurable cost-spike threshold — `M`
- **Goal:** Per-project (or per-webhook) cost-spike threshold instead of the hardcoded `$1.00`.
- **What's needed:** A column + UI + worker read.
- **Steps:**
  1. Add `costSpikeThresholdUsd numeric` to `projects` (or `webhooks`) in `apps/api/src/db/schema.ts` and the worker copy `apps/worker/src/db/schema.ts`. Run `npm run db:generate && npm run db:migrate`.
  2. In `apps/worker/src/consumers/ingestConsumer.ts`, replace the `COST_SPIKE_THRESHOLD_USD = 1.00` constant (line 169) with the value read from the project/webhook row inside `fireCostSpikeWebhooks`.
  3. Expose a setter on `apps/api/src/routes/projects.ts` (or the webhook CRUD in `routes/webhooks.ts`); surface it in the Settings UI (`apps/web`).
- **Risks:** Two schema copies must stay in sync (existing project convention).

### 1.2 SDK field redaction / hashing — `M`
- **Goal:** Make "redact what you need" true.
- **What's needed:** A redaction hook in the SDK before serialization.
- **Steps:**
  1. Add a `redact?: (step: TraceStepInput) => TraceStepInput` (and/or `redactKeys: string[]`, `hashInputs: boolean`) option to `AgentGraphConfig` (`packages/sdk/src/client.ts`) and thread it into `Trace`.
  2. Apply it in `Span.toStepInput()` (`packages/sdk/src/span.ts:70`) or in `Trace.addSpan` before pushing to `steps`.
  3. For hashing, use `node:crypto` `createHash` over the JSON of `input`/`output`.
  4. Add tests in `packages/sdk/src/span.test.ts`.
- **Risks:** Keep zero-runtime-deps guarantee — only `node:` built-ins.

### 1.3 SDK local queueing + retry — `M`
- **Goal:** "Spans queue locally if AgentGraph is down" — no data loss on transient failure.
- **What's needed:** A buffered sender with retry/backoff in the SDK.
- **Steps:**
  1. In `packages/sdk/src/client.ts`, wrap `sendIngest` with retry (exponential backoff, max N attempts) on network error / 5xx.
  2. In `Trace.flush` (`packages/sdk/src/trace.ts:52`), on final failure push the payload to an in-memory queue and re-attempt on the next `flush`/timer; optionally support an on-disk spill via an injected `persist` callback (keep core dep-free).
  3. Document at-least-once semantics; ingest is keyed by `traceId` so make the consumer idempotent (it already uses `onConflictDoNothing` for tool stats — verify trace insert path).
  4. Tests for retry + queue drain.
- **Risks:** Memory growth if the backend is down for long — cap the queue.

### 1.4 Expand the model pricing table — `S`
- **Goal:** Cover the providers the FAQ lists (Cohere, etc.).
- **What's needed:** Add entries to **both** copies.
- **Steps:** Add Cohere/Command-R and any missing models to `apps/api/src/lib/modelCosts.ts` **and** `apps/worker/src/lib/modelCosts.ts` (CLAUDE.md flags both). Preserve the longest-prefix sort in `computeCost()`.
- **Risks:** Drift between the two copies.

---

## Tier 2 — Real features (1–2 weeks each)

### 2.1 Python SDK — `L`
- **Goal:** Parity with the TS SDK surface shown on the page.
- **What's needed:** A new `packages/sdk-python/` (or separate repo) mirroring `AgentGraph` / `Trace` / `Span` and posting to `/v1/ingest`.
- **Steps:**
  1. Scaffold a Python package (`pyproject.toml`, `agentgraph/`), no heavy deps — use `httpx`/`requests`.
  2. Port the surface: `AgentGraph(api_key=…)`, async `trace(...)` context manager, `step(type, name, fn)`, `flush()`.
  3. Mirror the `IngestPayload` shape from `packages/types/src/trace.ts` (keep field names identical).
  4. Port OpenAI/Anthropic auto-instrumentation (mirror `packages/sdk/src/instrumentation/*`).
  5. Pytest suite mirroring `span.test.ts`/`trace.test.ts`.
- **Risks:** A second source of truth for the payload schema — generate from JSON Schema or document the contract carefully.

### 2.2 OTLP export — `L`
- **Goal:** "OTLP → Datadog / Honeycomb / your collector," currently only a tagline.
- **What's needed:** Convert spans to OTLP and export. Two placement options:
  - **(a) From the worker** (recommended): after the trace is persisted in `apps/worker/src/consumers/ingestConsumer.ts`, map `trace_steps` → OTLP spans and push to a configured OTLP endpoint via `@opentelemetry/exporter-trace-otlp-http`.
  - **(b) From the SDK:** dual-emit to the customer's collector. Heavier; conflicts with the zero-dep guarantee.
- **Steps (worker route):**
  1. Add per-project OTLP config (endpoint, headers) — new columns or a `project_integrations` table in `schema.ts`.
  2. Add `@opentelemetry/api` + OTLP exporter deps to the worker.
  3. Map step fields → span attributes (model, tokens, cost_usd, latency, status, parent linkage). Note: current `trace_steps` has no `parent_id` (`schema.ts:116`) — synthesize nesting from `step_index` or add a `parentStepId` column.
  4. Batch + retry; respect failures without blocking ingest.
- **Risks:** No parent/child linkage today → flat span trees unless a `parentStepId` is added.

### 2.3 Daily digest + hard cost cap alerts — `M`
- **Goal:** The two alert types beyond cost-spike.
- **What's needed:** A scheduled job (worker already runs cron jobs) + a cap check.
- **Steps:**
  1. **Daily digest:** add a cron in `apps/worker` that aggregates yesterday's spend per project and POSTs a `daily_digest` webhook (reuse the HMAC sender pattern in `fireCostSpikeWebhooks`). Add `"daily_digest"` to the allowed `webhooks.events`.
  2. **Hard cap:** add `monthlyCostCapUsd` to `projects`; in `apps/api/src/routes/ingest.ts` (next to the trace-quota check) reject with `402 cost_cap_exceeded` when projected spend exceeds the cap.
- **Risks:** Cost is computed in the worker post-ingest, so a pre-ingest hard cap is approximate — base it on the running monthly total.

### 2.4 Warehouse / object-store export pipe — `L` ✅ DONE (S3/NDJSON; GCS/BQ/Snowflake + parquet stubbed)
- **Goal:** "Pipe → S3 · BigQuery · Snowflake."
- **What's needed:** A scheduled exporter from Postgres → destination.
- **Steps:**
  1. Add a `project_export_configs` table (destination type, credentials ref, schedule).
  2. New worker cron: query traces/steps for the window, serialize (Parquet/NDJSON), push via the destination SDK (`@aws-sdk/client-s3`, `@google-cloud/bigquery`, etc.).
  3. Track high-water mark per project to avoid re-export.
- **Risks:** Credential storage/secrets management; large-volume export performance.

---

## Tier 3 — Hard / strategic (multi-week, product decisions)

### 3.1 Trace-driven tool-swap recommendations (+ schema fit, GitHub PRs) — `XL` ✅ DONE (engine + compare UI; GitHub-PR half deferred)
This is the flagship gap. Today's engine (`apps/api/src/services/recommendationEngine.ts`)
is **task-query catalog search**, not analysis of the tools an agent actually uses.

- **Goal:** "For tool X you're calling, here's a better alternative Y, scored, with a PR."
- **What's needed:** A trace-analysis pipeline, a swap-scoring model, and (optionally) GitHub integration.
- **Steps:**
  1. **Usage extraction:** aggregate `trace_steps.toolName` per project (the `idx_trace_steps_tool_name` index exists) into a `tool_usage_stats` rollup (calls, p50/p95 latency, error rate, cost).
  2. **Candidate generation:** for each used tool, find same-category alternatives in `tools`/`toolGlobalStats`.
  3. **Swap scoring:** extend scoring with the page's dimensions — **schema fit** (requires storing each tool's input/output schema; new column on `tools`), latency, cost, reliability, region. This is net-new vs. the current `successRate/latency/popularity/sentiment` formula.
  4. **Compare API + UI:** new endpoint returning current-vs-suggested deltas; a compare drawer in `apps/web`.
  5. **GitHub PR (optional):** OAuth GitHub App, map a tool to a code location (a "tool registry" mapping must exist first), open a branch + PR via the GitHub API.
- **Risks:** Schema-fit scoring needs tool schemas we don't store. GitHub PRs need a registry mapping that doesn't exist. Largest single effort here.

### 3.2 Span-based metered billing (Stripe) — `L`–`XL` (Phase 5) ⏸ DEFERRED (do later, 2026-05-29 decision)
- **Goal:** "$0.10 / 1K spans," soft limits, opt-in billing.
- **Steps:** Stripe customer/subscription wiring; meter span counts (today only trace counts increment, `ingest.ts:72`); usage-record reporting; replace the `402` hard stop with soft-limit + email. Depends on `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (already in env docs).
- **Risks:** Switching from trace-count to span-count metering touches the quota logic and the pricing copy (Tier 0.2).

### 3.3 SSO / SCIM — `L` (Phase 5) ⬜ TODO (needs Clerk enterprise plan to verify)
- **Goal:** Enterprise auth claim on the Scale plan.
- **Steps:** Configure Clerk's SSO/SAML + SCIM (org already on Clerk); gate behind plan; map orgs/members. Mostly configuration + plan gating in `apps/api` auth middleware.
- **Risks:** Plan entitlement enforcement.

### 3.4 EU data residency — `XL` ❌ DROPPED (not needed, 2026-05-29 decision)
- **Goal:** "EU data stays in EU."
- **Steps:** Region-pinned Postgres/Redis per project; region routing at ingest; data-locality guarantees across worker + exports. This is infrastructure, not a feature flag.
- **Risks:** Deep architectural change; affects every storage path.

### 3.5 Shadow mode → traffic split → cutover — ✅ DONE · option (b) offline replay (no live routing)
- **Conflict:** This requires AgentGraph to be **in the request path** to route/split traffic, which directly contradicts **Principle #2 on the landing page** ("we never route your model calls / no proxy") and the current out-of-band ingest architecture.
- **Decision needed before any code:** either (a) drop the claim, (b) redefine "shadow mode" as *offline replay scoring* of a suggested tool against recorded traces (no live routing — fits the architecture), or (c) build an opt-in proxy/gateway and revise the principle.
- **Recommended:** option (b) — score a suggested tool against the last 14 days of recorded traces, no live traffic. Fits Tier 3.1's data pipeline.

---

## Suggested sequencing

~~1. Tier 0 — stop the page from lying.~~ ✅ done
~~2. Tier 1 — configurable threshold, redaction, SDK queueing, pricing table.~~ ✅ done
~~3. Tier 2 (OTLP + Python SDK + digest/cap).~~ ✅ done (2.4 export pipe still TODO)

**Next session (2026-05-30), in order:**
1. **2.4 warehouse/object-store export** — implement + unit test; integration test needs cloud creds.
2. **3.1 trace-driven recommendations** — the real product bet; start with the offline usage rollup + swap scoring + compare API/UI. Skip the GitHub-PR piece (blocked).
3. **3.5 shadow mode** — option (b) offline replay scoring; builds directly on 3.1's pipeline.
4. **3.3 SSO/SCIM** — plan-gating + mapping; config verification needs Clerk enterprise.

Each adds a migration → do them sequentially, not in parallel.

## Cross-cutting reminders
- `modelCosts.ts` and the DB `schema.ts` each have **two copies** (api + worker) — keep them in sync.
- New request/response shapes go in `packages/types/src/` and are imported, never duplicated.
- New DB tables: `db:generate` → `db:migrate`, export the type from `schema.ts`.
- SDK must stay **zero-runtime-deps** (`node:` built-ins only).
