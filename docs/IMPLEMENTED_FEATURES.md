# AgentGraph — What Was Built This Cycle & How to Run It

A practical guide to everything implemented in this work cycle: a security
hardening pass, then features 0.x–3.x from `IMPLEMENTATION_PLAN.md`. For each
feature you get **what it is**, **how to enable it**, and **how to use it**.

> Read order if you're setting up: **§1 Quick start** → **§2 Env vars** →
> **§3 Migrations** → then the per-feature sections.

---

## 1. Quick start (make everything work)

Everything ships behind config and is backward-compatible (no env = old
behavior), with one exception: **production boot now requires
`CLERK_AUTHORIZED_PARTIES`** (see §4.1).

```bash
# 1. install (root of the monorepo)
npm install

# 2. apply DB migrations 0001–0005 (Postgres must be running)
cd apps/api && npm run db:migrate

# 3. set env vars — see §2 (at minimum copy .env.example → .env)

# 4. run everything
cd ../.. && npm run dev        # api + web + worker via Turborepo

# 5. verify the build is healthy
npm run typecheck              # 7/7 packages
npm run test                   # api 102 · worker 21 · sdk 36 · types 30 · web 3
```

Python SDK (separate, not part of the npm build):

```bash
cd packages/sdk-python
pip install -e .               # or: pip install -e ".[dev]" for tests
python -m pytest               # 41 tests
```

---

## 2. Environment variables (new / changed)

| Var | Where | Required? | Purpose |
|-----|-------|-----------|---------|
| `CLERK_AUTHORIZED_PARTIES` | api | **Required in prod** (boot fails without it) | Validates Clerk JWT `azp`. Comma-separated dashboard origins, e.g. `https://app.agentgraph.dev`. |
| `WEBHOOK_ENCRYPTION_KEY` | api + worker | Optional (recommended in prod) | 64 hex chars (`openssl rand -hex 32`). AES-256-GCM encrypts webhook signing secrets at rest. Unset = secrets stored as plaintext (dev). |
| `AWS_REGION` / `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | worker | Only if using S3 export (2.4) | Standard AWS provider chain. Credentials are read from the env, **never** stored in the DB. |

Already-existing vars (`DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`,
`CLERK_WEBHOOK_SECRET`, `NEXT_PUBLIC_*`, `GITHUB_TOKEN`) are unchanged. See
`.env.example`.

> **Important:** set `WEBHOOK_ENCRYPTION_KEY` in **production only**, before
> creating webhooks. Webhooks created while it's unset are stored in plaintext
> and won't auto-encrypt until rotated.

---

## 3. Database migrations

Run `cd apps/api && npm run db:migrate`. Migrations are additive and safe to
run on an existing DB.

| Migration | Adds |
|-----------|------|
| `0001_api_key_prefix_index` | Index `idx_api_keys_key_prefix` (fast API-key auth) |
| `0002_cynical_steve_rogers` | `projects.cost_spike_threshold_usd` |
| `0003_secret_shadowcat` | `projects.monthly_cost_cap_usd` |
| `0004_gifted_la_nuit` | `projects.otlp_endpoint/otlp_headers/otlp_enabled`, `trace_steps.parent_step_id` |
| `0005_worthless_iron_monger` | `project_export_configs`, `tool_usage_stats`, `tools.input_schema/output_schema` |

> The schema lives in **two copies** that must stay in sync:
> `apps/api/src/db/schema.ts` (source of truth) and `apps/worker/src/db/schema.ts`.
> Same for cost pricing: `apps/api/src/lib/modelCosts.ts` + the worker copy.

---

## 4. Security hardening

All on `main` (commit `5b96c56`). These changed behavior of existing flows.

### 4.1 Auth & identity
- **API-key lookup is now O(1):** auth narrows by an indexed 16-char
  `key_prefix`, then bcrypt-verifies the single matching row (was: scan every
  key). New keys use bcrypt cost 12.
- **Strict identity isolation:** a Clerk login with a *new* `clerk_id` but an
  email that already owns data will **not** inherit that data (prevents
  account takeover when a corporate email is reassigned). A legitimately
  recreated account needs an explicit recovery flow. *What you'll see:* the
  new user simply has no access to the old org; a warning is logged.
- **azp hard-fail:** the API refuses to boot in production if
  `CLERK_AUTHORIZED_PARTIES` is unset.

### 4.2 Webhooks
- **SSRF guard:** webhook URLs must be `https` and must not resolve to
  private/loopback/link-local/metadata IPs — checked at creation **and**
  re-validated at the moment of connection (defeats DNS rebinding).
- **Secrets encrypted at rest** when `WEBHOOK_ENCRYPTION_KEY` is set (see §2).
- **Role-gated CRUD:** only org `owner`/`admin` can create/update/delete
  webhooks or mint/revoke API keys from the dashboard. (API-key auth is a
  machine credential and is exempt.)

### 4.3 Ingest & limits
- **Atomic quota increment** (`SET col = col + 1`) — no lost counts under load.
- **Rate limiter** keys on `sha256(full bearer token)` (a fixed prefix
  collided across all Clerk JWTs).
- **Dead-letter queue:** unprocessable payloads (bad JSON, schema fail,
  missing projectId, tx failure) go to the Redis list
  `agentgraph:ingest:dead` (capped) instead of vanishing. Inspect with
  `LRANGE agentgraph:ingest:dead 0 -1`.

---

## 5. Landing page honesty (Tier 0)

`apps/landing/app/page.tsx` — the marketing site now matches the product:
SDK code samples use the real API (`ag.trace({...})`, `trace.step(type, name,
fn)`, `await trace.flush()`), the curl sample posts to `/v1/ingest`, the
Python tab is marked "coming soon", pricing is in **traces** (Free = 10,000
traces/mo), and the FAQ states the real 402-over-quota behavior. No setup.

---

## 6. TypeScript SDK (`@agentgraph/sdk`) — Tier 1.2 + 1.3

Still **zero runtime dependencies**. New optional config:

```ts
const ag = new AgentGraph({
  apiKey: process.env.AG_KEY!,
  // 1.2 — redaction / hashing (applied per step, in this order):
  redactKeys: ["password", "ssn", "authorization"], // deep-strip these keys → "[REDACTED]"
  hashInputs: false,            // true → replace input/output with { _sha256: "<hex>" }
  redact: (step) => step,       // optional final hook, full control
  // 1.3 — delivery resilience:
  maxRetries: 3,                // retry on network err / HTTP 5xx (not 4xx)
  baseDelayMs: 200,             // exponential backoff base
  maxQueueSize: 1000,           // bound the in-memory retry queue
});
```

**How it behaves:** `trace.flush()` retries transient failures with backoff;
on exhaustion the payload is queued in memory and drained (oldest-first) on the
next flush. 4xx errors are surfaced immediately (bad payload). Delivery is
at-least-once — safe because the server upserts by `traceId`.

---

## 7. Model pricing (Tier 1.4)

Added Cohere `command-r` / `command-r-plus` plus newer OpenAI/Anthropic/
Google/Meta models to **both** `modelCosts.ts` copies. Cost is auto-computed at
ingest for `llm_call` steps; nothing to configure. Add models to both copies
and keep the longest-prefix match intact.

---

## 8. Configurable cost-spike threshold (Tier 1.1)

Per-project alert threshold (default $1.00) instead of a hardcoded value.

- **Set it:** `PATCH /v1/projects/:id/settings` (owner/admin)
  `{ "costSpikeThresholdUsd": 5.00 }` — or via the dashboard Settings page.
- **Effect:** the worker fires `cost_spike` webhooks when a trace's cost ≥ the
  project's threshold.

---

## 9. Daily digest + hard cost cap (Tier 2.3)

### Daily digest webhook
- Subscribe a webhook to the new `"daily_digest"` event.
- A worker cron (06:00 UTC) posts yesterday's per-project spend (trace count,
  total cost, tokens, errors), HMAC-signed like all webhooks.

### Hard monthly cost cap
- **Set it:** `PATCH /v1/projects/:id/settings` `{ "monthlyCostCapUsd": 200 }`
  (null = no cap).
- **Effect:** `POST /v1/ingest` returns `402 cost_cap_exceeded` once the
  project's running monthly spend reaches the cap. (Approximate — based on the
  committed running total; the query is skipped entirely when no cap is set.)

---

## 10. OTLP export (Tier 2.2)

Pipe persisted traces to Datadog / Honeycomb / any OTLP collector — out of
band, never in your request path.

- **Enable it:** `PATCH /v1/projects/:id/integrations/otlp` (owner/admin)
  ```json
  { "otlpEnabled": true,
    "otlpEndpoint": "https://api.honeycomb.io/v1/traces",
    "otlpHeaders": { "x-honeycomb-team": "<key>" } }
  ```
  Endpoint must be https when enabled.
- **Effect:** after each trace is persisted, the worker maps its steps to OTLP
  spans (`gen_ai.*` + `agentgraph.*` attributes, OK/ERROR status, timing) and
  exports them. Failures are logged and never block ingest.
- **Verify:** needs a live collector to see spans end-to-end; the step→span
  mapping is unit-tested.

---

## 11. Warehouse / object-store export (Tier 2.4)

Scheduled export of new traces to your own bucket/warehouse.

- **Configure:** `POST /v1/projects/:id/exports` (owner/admin)
  ```json
  { "destination": "s3", "format": "ndjson", "enabled": true,
    "config": { "bucket": "my-bucket", "region": "us-east-1", "prefix": "agentgraph" } }
  ```
  Manage with `GET` / `PATCH /:configId` / `DELETE /:configId`.
- **Credentials:** the worker reads AWS creds from its **environment** (§2) —
  never put secrets in `config`.
- **Effect:** a worker cron (03:00 UTC) exports traces newer than a per-config
  high-water-mark cursor, advances the cursor, and isolates failures per config.
- **Status:** **S3 + NDJSON is fully implemented.** GCS / BigQuery / Snowflake
  and the `parquet` format are intentional stubs that throw a clear
  "not yet implemented" error — adding them means installing their SDKs and
  wiring credentials.

---

## 12. Trace-driven tool-swap recommendations (Tier 3.1)

"You're calling tool X — here's a better alternative Y, scored." Driven by the
tools your agents *actually call* (`trace_steps.tool_name`), not catalog search.

- **Usage rollup:** `GET /v1/projects/:id/insights/tool-usage` → per-tool
  observed stats (calls, error rate, p50/p95 latency, total cost). Cached for
  ~1h in `tool_usage_stats`, recomputed lazily.
- **Recommendations:** `GET /v1/projects/:id/insights/recommendations` →
  same-category alternatives scored on reliability / latency / popularity /
  **schema-fit** (input/output JSON-schema similarity), with current-vs-suggested
  deltas and a reason.
- **Dashboard:** a "Trace swap insights" panel on the Recommendations page
  ("Analyze my tools").
- **Notes / what's missing:**
  - **Schema-fit is mostly null today** because seeded catalog tools don't have
    `input_schema`/`output_schema` populated yet (the columns exist). Populate
    them to make schema-fit meaningful.
  - The advertised **GitHub-PR generation is deferred** — it needs a GitHub
    App and a tool→code "registry" mapping that doesn't exist yet.

---

## 13. Shadow mode — offline replay (Tier 3.5)

Score a candidate tool against your **recorded** traces, with **no live
routing** (this preserves the "we never proxy your calls" principle — we chose
the offline-replay interpretation, option b).

- **Run it:** `POST /v1/projects/:id/insights/shadow-replay`
  `{ "currentTool": "stripe.charge", "candidateSlug": "adyen", "windowDays": 14 }`
- **Returns:** observed-vs-projected p50/p95 latency and error rate over the
  window. Candidate metrics are **estimates** from catalog/global benchmarks.
  **Cost projection is null** (no per-tool cost benchmark exists) — observed
  cost is shown for context. Also surfaced via the dashboard panel.

---

## 14. Python SDK (Tier 2.1)

`packages/sdk-python` — mirrors the TS SDK, zero required deps (stdlib
`urllib`), posts the same `IngestPayload` contract to `/v1/ingest`.

```python
from agentgraph import AgentGraph

ag = AgentGraph(api_key="ag_live_...", base_url="http://localhost:3001")
with ag.trace(agent_id="checkout-agent", session_id="s1", user_id="u1") as t:
    def charge(span):
        span.set_input({"order": 123})
        r = stripe.charge(order)
        span.set_output(r)
        return r
    t.step("tool_call", "stripe.charge", charge)
# auto-flushes on context exit
```

Optional `instrument_openai(client, trace)` / `instrument_anthropic(client, trace)`.
Not part of the npm/Turborepo build; install/test with pip (§1).

---

## 15. New API endpoints (reference)

| Method | Path | Auth | Feature |
|--------|------|------|---------|
| PATCH | `/v1/projects/:id/settings` | owner/admin | cost-spike threshold, monthly cost cap |
| PATCH | `/v1/projects/:id/integrations/otlp` | owner/admin | OTLP export config |
| GET/POST | `/v1/projects/:id/exports` | GET: member · POST: owner/admin | warehouse export configs |
| PATCH/DELETE | `/v1/projects/:id/exports/:configId` | owner/admin | update/remove export config |
| GET | `/v1/projects/:id/insights/tool-usage` | member | observed per-tool stats |
| GET | `/v1/projects/:id/insights/recommendations` | member | swap recommendations |
| POST | `/v1/projects/:id/insights/shadow-replay` | member | offline replay scoring |

"member" = any org member (via Clerk session) or a valid project API key.

---

## 16. Things you should know

- **Commits:** this cycle is commits `5b96c56` (security, already pushed) →
  `a197cf4` → `15be398` → `d17df39` → the Tier 2.4/3.1/3.5 commit. The last
  four are **local** unless you've pushed — `origin/main` may still be at
  `5b96c56`. Push with `git push origin main` (fast-forward).
- **Still planned:** **3.3 SSO/SCIM** is the only remaining planned item
  (needs a Clerk enterprise plan to verify). **3.2 Stripe billing** is
  deferred; **3.4 EU data residency** was dropped. See `IMPLEMENTATION_PLAN.md`.
- **Tests don't hit live infra:** S3, OTLP collectors, and a real DB aren't
  exercised in CI here — those paths are unit-tested and flagged "needs live
  creds." Do an integration pass before relying on them in prod.
- **Pre-existing `apps/web` lint errors** (unused vars in a few UI components +
  a missing Next plugin rule) are unrelated to this work and were left alone.
- **`apps/api` lints clean**; test files lint without a build project and
  `no-explicit-any` is relaxed for test doubles (eslint flat config).
