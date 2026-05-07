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
apps/web/        Next.js 14 App Router dashboard
apps/worker/     Background worker — ingest consumer + cron jobs
packages/types/  Shared Zod schemas; the contract between all apps
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

### Done (Phases 0–2)
- Monorepo scaffold, Docker Compose, ESLint/Prettier/Husky
- Auth: Clerk integration, org/project/API key management
- Ingest: Redis queue, worker consumer, cost computation, tool auto-discovery
- Traces: list + detail endpoints, waterfall timeline dashboard UI
- Tool catalog: 83 seeded tools, FTS GIN index, recommendation engine with Redis cache
- Dashboard: traces UI, tool grid, tool profile, recommendations form

### Pending (Phases 3–4)
- Phase 3: `@agentgraph/sdk` npm package, OpenTelemetry-style auto-instrumentation
- Phase 4: billing enforcement, cost spike webhooks, `/cost-explorer` page, `/settings` page, public docs

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

### Cost model pricing
Add new models to `apps/api/src/lib/modelCosts.ts` AND `apps/worker/src/lib/modelCosts.ts` (both copies).
The longest-prefix sort in `computeCost()` is intentional — it prevents `gpt-4o` matching before `gpt-4o-mini`.
