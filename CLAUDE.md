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
npm run test          # Vitest (apps/api only so far)
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
- `flexAuth` middleware in routes dispatches based on the `ag_` prefix
- `apiKeyAuth` (`apps/api/src/middleware/apiKeyAuth.ts`) — bcrypt compare with 60s in-memory cache
- `clerkSessionAuth` (`apps/api/src/middleware/clerkSessionAuth.ts`) — `@clerk/backend` verifyToken

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

## Environment variables

The API and worker read from `.env` via `dotenv/config`. The web app uses Next.js env loading.

Required for local dev:
```
DATABASE_URL=postgres://agentgraph:agentgraph@localhost:5432/agentgraph
REDIS_URL=redis://localhost:6379
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
```

## Branch & PR conventions

- `main` — stable, always deployable
- `phase/N-name` — feature branch per phase
- Squash merge PRs; fast-forward main after merge with `git merge --ff-only origin/<base-branch>`
- Branch currently being worked on: check `git branch` — development phases use `phase/N-*` naming

## What's built vs what's pending

### Done (Phases 0–3)
- Monorepo scaffold, Docker Compose, ESLint/Prettier/Husky
- Auth: Clerk integration, org/project/API key management
- Ingest: Redis queue, worker consumer, cost computation, tool auto-discovery
- Traces: list + detail endpoints, waterfall timeline dashboard UI
- Tool catalog: 83 seeded tools, FTS GIN index, recommendation engine with Redis cache
- Dashboard: traces UI, tool grid, tool profile, recommendations form
- `@agentgraph/sdk`: `AgentGraph` client, `Trace`/`Span` classes, OpenAI + Anthropic auto-instrumentation

### Pending (Phase 4)
- Billing enforcement, cost spike webhooks, `/cost-explorer` page, `/settings` page, public docs

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
- Fetch with Clerk token: `const { getToken } = await auth(); const token = await getToken();`
- Pass token as `Authorization: Bearer ${token}` to the API
- Client components (interactive forms etc.) go in a separate `*Client.tsx` file
- In Next.js 16, dynamic route `params` is a `Promise` — always `await params` in server components or use `use(params)` in client components
- Keep `page.tsx` as a thin server wrapper; push all client hooks into a co-located `*Client.tsx`
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

---

## Cloud Deployment Guide

The stack requires four services: **PostgreSQL**, **Redis**, **API** (Express), **Worker** (Node), and **Web** (Next.js). Below are guides for the two recommended platforms.

---

### Option A — Railway (recommended, easiest)

Railway natively supports all five services in one project with private networking.

#### 1. Create a Railway project

```bash
npm install -g @railway/cli
railway login
railway init   # inside /home/user/AgentGraph
```

#### 2. Provision managed services

In the Railway dashboard → **+ New** → add:
- **PostgreSQL** (Railway-managed) — copy `DATABASE_URL` from the service's Variables tab
- **Redis** (Railway-managed) — copy `REDIS_URL`

#### 3. Deploy the API

```bash
# From repo root
railway service create agentgraph-api
railway link          # select the service
railway variables set \
  DATABASE_URL="<from step 2>" \
  REDIS_URL="<from step 2>" \
  CLERK_SECRET_KEY="sk_live_..." \
  CLERK_WEBHOOK_SECRET="whsec_..."
```

Add a `railway.toml` (or set in dashboard):
```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build --workspace=apps/api"

[deploy]
startCommand = "node apps/api/dist/index.js"
healthcheckPath = "/health"
```

#### 4. Deploy the Worker

```bash
railway service create agentgraph-worker
# Set same DATABASE_URL + REDIS_URL env vars
```

`railway.toml` for worker:
```toml
[build]
buildCommand = "npm install && npm run build --workspace=apps/worker"

[deploy]
startCommand = "node apps/worker/dist/index.js"
```

#### 5. Deploy the Web (Next.js)

```bash
railway service create agentgraph-web
railway variables set \
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..." \
  CLERK_SECRET_KEY="sk_live_..." \
  NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in" \
  NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up" \
  NEXT_PUBLIC_API_URL="https://<api-service>.railway.app"
```

`railway.toml` for web:
```toml
[build]
buildCommand = "npm install && npm run build --workspace=apps/web"

[deploy]
startCommand = "npm run start --workspace=apps/web"
```

#### 6. Run DB migrations on first deploy

```bash
railway run --service agentgraph-api npm run db:migrate
railway run --service agentgraph-api npm run db:seed
```

---

### Option B — Vercel (web) + Render (API + worker + services)

Split the stack: Vercel handles the Next.js frontend; Render runs the backend.

#### Web → Vercel

1. Push to GitHub, import the repo at vercel.com
2. Set **Root Directory** to `apps/web`
3. Framework preset: **Next.js** (auto-detected)
4. Add env vars:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
   CLERK_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_API_URL=https://<render-api>.onrender.com
   ```
5. Deploy — Vercel auto-detects Turborepo and builds only `apps/web`.

#### PostgreSQL + Redis → Render

- **PostgreSQL**: Render dashboard → **+ New** → PostgreSQL → copy the Internal Connection String as `DATABASE_URL`
- **Redis**: **+ New** → Redis → copy `REDIS_URL`

#### API → Render (Web Service)

| Setting | Value |
|---|---|
| Root directory | _(leave blank — repo root)_ |
| Build command | `npm install && npm run build --workspace=apps/api` |
| Start command | `node apps/api/dist/index.js` |
| Health check path | `/health` |

Env vars: `DATABASE_URL`, `REDIS_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`

#### Worker → Render (Background Worker)

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build --workspace=apps/worker` |
| Start command | `node apps/worker/dist/index.js` |

Env vars: `DATABASE_URL`, `REDIS_URL`

#### Run migrations

Use the Render shell (dashboard → API service → Shell tab):
```bash
npm run db:migrate
npm run db:seed
```

---

### Environment variables reference

| Variable | Required by | Notes |
|---|---|---|
| `DATABASE_URL` | api, worker | Postgres connection string |
| `REDIS_URL` | api, worker | Redis connection string |
| `CLERK_SECRET_KEY` | api, web | `sk_live_...` from Clerk dashboard |
| `CLERK_WEBHOOK_SECRET` | api | From Clerk → Webhooks → Signing secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | web | `pk_live_...` from Clerk dashboard |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | web | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | web | `/sign-up` |
| `NEXT_PUBLIC_API_URL` | web | Public URL of the deployed API |

### Clerk webhook setup (required for org sync)

After deploying the API, register the webhook in the Clerk dashboard:
- URL: `https://<api-url>/webhooks/clerk`
- Events: `user.created`, `organization.created`, `organizationMembership.created`
- Copy the **Signing Secret** → set as `CLERK_WEBHOOK_SECRET`
