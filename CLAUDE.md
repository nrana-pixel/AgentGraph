# AgentGraph — Claude Code Guide

This file gives Claude Code the context it needs to work effectively in this codebase.

---

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Project Context

## Repository layout

```
apps/api/        Express REST API — all backend logic lives here
apps/web/        Next.js 16 App Router dashboard
apps/worker/     Background worker — ingest consumer + cron jobs
packages/types/  Shared Zod schemas; the contract between all apps
packages/sdk/    @agentgraph/sdk — OpenTelemetry-style tracing client
```

Turborepo monorepo with npm workspaces. TypeScript strict mode everywhere.

## Key commands

```bash
npm run dev           # start all apps (Turborepo)
npm run build         # production build all apps
npm run typecheck     # tsc --noEmit across all packages
npm run test          # Vitest across all packages
npm run lint          # ESLint

cd apps/api
npm run db:migrate    # run Drizzle migrations
npm run db:seed       # seed 83 tools into the tool catalog
npm run db:generate   # regenerate migration files from schema changes
```

## Architecture decisions

### Auth — dual pattern
- **SDK clients** send `ag_*` API keys in `Authorization: Bearer ag_live_...`
- **Dashboard** sends Clerk session JWTs in `Authorization: Bearer eyJ...`
- `flexAuth` middleware in `apps/api/src/middleware/flexAuth.ts` dispatches based on the `ag_` prefix
- `apiKeyAuth` (`apps/api/src/middleware/apiKeyAuth.ts`) — bcrypt compare with 60s in-memory cache
- `clerkSessionAuth` (`apps/api/src/middleware/clerkSessionAuth.ts`) — `@clerk/backend` verifyToken
- `CLERK_AUTHORIZED_PARTIES` env var controls allowed JWT issuers

### Database — Drizzle ORM
- Schema is the single source of truth: `apps/api/src/db/schema.ts`
- All migrations in `apps/api/src/db/migrations/`
- `postgres.js` driver (not `pg`). Import `db` from `apps/api/src/db/index.ts`
- `metadata`, `input`, `output` columns are stored as JSON strings in `text` columns
- Arrays (`dataResidency`, `tags`) are native Postgres `text[]` — use `ARRAY[...]::text[]` not `JSON.stringify`

### Ingest pipeline
1. `POST /v1/ingest` validates payload, attaches `projectId` + `traceId`, pushes to Redis queue `agentgraph:ingest:queue`
2. Worker `BRPOP`s from that queue, runs a Postgres transaction: inserts trace + steps, auto-discovers tool slugs
3. Cost computed from model pricing table in `apps/api/src/lib/modelCosts.ts` — longest-prefix sort matters

### Tool Intelligence Graph
- Seeded catalog: `apps/api/src/db/seed/tools.ts` (83 tools, 15 categories)
- Cold-start: tools with `totalCalls < 50` are capped at score 70/100, marked `seeded`
- Graduation: once 50+ real calls accumulate, `data_source` flips to `telemetry`
- Recommendation engine: `apps/api/src/services/recommendationEngine.ts`
  - Score = `successRate×40% + latency×20% + popularity×25% + sentiment×15%`
  - FTS via `plainto_tsquery` + `to_tsvector` — GIN index in migration `0000_tools_fts_index.sql`
  - Results cached in Redis for 5 minutes (`RECOMMEND_CACHE_PREFIX`)

### Rate limiting
Redis sliding-window, 1000 req/min per key. `apps/api/src/middleware/rateLimiter.ts`.

### Shared types
All Zod schemas live in `packages/types/src/`. Import from `@agentgraph/types`.
Never duplicate schemas — add to the package and import.
Key response types: `TraceRow`, `TraceStepRow` (in `trace.ts`), `ToolListItem` (in `tool.ts`).

### Dashboard data fetching
- `useProject` hook (`apps/web/hooks/useProject.ts`) fetches the user's first project + Clerk token
- `apiGet/apiPost/apiPatch/apiDelete` helpers in `apps/web/lib/api.ts` handle auth headers + base URL
- All dashboard pages fetch live data from the API — `lib/data.ts` mock data is removed
- Onboarding: `OnboardingGate` + `GettingStartedCard` in `apps/web/components/onboarding/` shown to new users

## Environment variables

Copy `.env.example` to `.env`. The API and worker read from `.env` via `dotenv/config`. The web app uses Next.js env loading.

Required for local dev:
```
DATABASE_URL=postgres://agentgraph:agentgraph@localhost:5432/agentgraph
REDIS_URL=redis://localhost:6379
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Optional:
```
CLERK_AUTHORIZED_PARTIES=https://app.agentgraph.dev   # prod JWT allowlist
CLERK_JWT_AUDIENCE=...                                 # if Clerk template emits aud
GITHUB_TOKEN=ghp_...                                   # sentiment fetcher (5k req/hr)
STRIPE_SECRET_KEY=sk_test_...                          # Phase 5: billing
STRIPE_WEBHOOK_SECRET=whsec_...                        # Phase 5: Stripe webhook
```

## Branch & PR conventions

- `main` — stable, always deployable
- Feature branches off main; squash merge PRs
- Branch currently being worked on: check `git branch`

## What's built

### Done (Phases 0–4 + prod hardening)
- Monorepo scaffold, Docker Compose, ESLint/Prettier/Husky
- Auth: Clerk integration, org/project/API key management, `flexAuth` shared middleware
- Ingest: Redis queue, worker consumer, cost computation, tool auto-discovery
- Traces: list + detail endpoints, waterfall/flame/timeline dashboard UI (live API)
- Tool catalog: 83 seeded tools, FTS GIN index, recommendation engine with Redis cache (live API)
- Dashboard overview: live stats, daily activity chart, top agents, recent traces (live API)
- Cost Explorer: daily spend chart, model/agent breakdown, plan usage meter (live API)
- Settings: billing meter, API key CRUD, webhook CRUD (live API)
- Recommendations: form + results UI (live API)
- `@agentgraph/sdk`: `AgentGraph` client, `Trace`/`Span` classes, OpenAI + Anthropic auto-instrumentation, zero runtime deps
- Billing enforcement: `POST /v1/ingest` checks plan limits → 402 when over quota
- Cost spike webhooks: HMAC-SHA256 signed, fires when trace cost ≥ $1.00
- Onboarding: `OnboardingGate` + `GettingStartedCard` shown to new users
- Vitest test suites: API routes, middleware, SDK span/trace, shared types

### Phase 4 details

#### Billing enforcement
- `POST /v1/ingest` checks `organizations.tracesUsedThisMonth` vs `PLAN_TRACE_LIMITS` (free: 10k, pro: 500k, team: 5M)
- Returns `402 trace_limit_exceeded` with upgrade message when over quota
- `GET /v1/projects/:id/billing` returns plan, usage, limit, usagePct

#### Cost spike webhooks
- Worker fires webhooks after every trace insert where `totalCostUsd ≥ $1.00` (hardcoded in `ingestConsumer.ts`)
- Only fires to webhooks with `"cost_spike"` in their events array
- HMAC-SHA256 signed with per-webhook secret; header: `X-AgentGraph-Signature: sha256=<hex>`
- Timeout: 5s per webhook; uses `Promise.allSettled` so one failure doesn't block others

### Pending (Phase 5)
- Stripe billing integration, public documentation site, SSO/SAML for enterprise plan

## Testing

Tests use [Vitest](https://vitest.dev/). Run `npm run test` from repo root.

Test files live next to the source they test:
- `apps/api/src/lib/modelCosts.test.ts`
- `apps/api/src/middleware/apiKeyAuth.test.ts`, `clerkSessionAuth.test.ts`, `errorHandler.test.ts`, `rateLimiter.test.ts`
- `apps/api/src/routes/ingest.test.ts`, `traces.test.ts`
- `apps/api/src/services/recommendationEngine.test.ts`
- `apps/web/lib/api.test.ts`
- `packages/sdk/src/span.test.ts`, `trace.test.ts`
- `packages/types/src/schemas.test.ts`

Each package has its own `vitest.config.ts`.

## Common tasks

### Adding a new API route
1. Create `apps/api/src/routes/yourRoute.ts`
2. Mount in `apps/api/src/index.ts`
3. Add Zod schema to `packages/types/src/` if it has a new request/response shape
4. Use `flexAuth` for endpoints that need both Clerk + API key support

### Adding a new DB table
1. Add to `apps/api/src/db/schema.ts`
2. Run `npm run db:generate` to create a migration file
3. Run `npm run db:migrate` to apply it
4. Export the type from schema.ts

### Adding a dashboard page
- Server components live in `apps/web/app/(dashboard)/`
- Keep `page.tsx` as a thin server wrapper (`export const dynamic = "force-dynamic"`); push all client hooks into a co-located `*PageClient.tsx`
- Use `useProject()` hook to get the active project + Clerk token
- Use `apiGet/apiPost/apiPatch/apiDelete` from `@/lib/api` for all API calls
- In Next.js 16, dynamic route `params` is a `Promise` — always `await params` in server components
- ESLint is no longer run during `next build` in Next.js 16 — run it separately via `npm run lint`
- `next.config.ts` uses `transpilePackages` for `@clerk/nextjs`, `@clerk/clerk-react`, `@clerk/shared`

### Using @agentgraph/sdk

```ts
import { AgentGraph } from "@agentgraph/sdk";

const ag = new AgentGraph({ apiKey: "ag_live_..." });
const trace = ag.trace({ agentId: "my-agent", sessionId: "s1", userId: "u1" });

// Wraps any async work — records latency, captures errors automatically
const result = await trace.step("tool_call", "web_search", async (span) => {
  span.setInput({ query });
  const data = await search(query);
  span.setOutput({ results: data });
  return data;
});

await trace.flush(); // POST /v1/ingest
```

Auto-instrumentation (patches the SDK client in-place):
```ts
import { instrumentOpenAI } from "@agentgraph/sdk/openai";
import { instrumentAnthropic } from "@agentgraph/sdk/anthropic";

instrumentOpenAI(openai, trace);
instrumentAnthropic(anthropic, trace);
```

SDK source lives in `packages/sdk/src/`. It has zero runtime dependencies — uses native `fetch` (Node 18+).

### Cost model pricing
Add new models to `apps/api/src/lib/modelCosts.ts` AND `apps/worker/src/lib/modelCosts.ts` (both copies).
The longest-prefix sort in `computeCost()` is intentional — it prevents `gpt-4o` matching before `gpt-4o-mini`.

### Clerk webhook setup
See `docs/CLERK_WEBHOOK_SETUP.md` for full setup, troubleshooting, and replay instructions. Short version:
- URL: `https://<api-url>/v1/auth/webhooks/clerk`
- Events: `user.created`, `user.updated`, `organization.created`, `organization.updated`, `organizationMembership.created`
- Copy the **Signing Secret** → set as `CLERK_WEBHOOK_SECRET`

---

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
