# AgentGraph

**Runtime tool intelligence layer for AI agents.**

AgentGraph is a telemetry-driven tool catalog that your AI agents can query at runtime to discover, compare, and select the best tools for any task — ranked by real-world reliability, latency, popularity, and community sentiment.

---

## What it does

- **Ingest traces** from your agents (LLM calls, tool calls, retrievals) via a simple SDK
- **Auto-discover tools** from telemetry — unknown tool slugs are catalogued automatically
- **Score & rank tools** using a composite engine (40% success rate + 20% latency + 25% popularity + 15% sentiment)
- **Query recommendations at runtime** — agents ask "what's the best tool for sending email?" and get a ranked, scored answer
- **Dashboard** — browse the tool catalog, view per-tool profiles, and explore recommendations

---

## Tech stack

| Layer | Technology |
|---|---|
| Monorepo | Turborepo + npm workspaces |
| API | Express + TypeScript |
| Dashboard | Next.js 14 App Router |
| Background worker | Node.js (BRPOP consumer + cron) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Cache / Queue | Redis 7 |
| Auth | Clerk (JWT + webhooks) |
| Containerisation | Docker Compose |

---

## Project structure

```
AgentGraph/
├── apps/
│   ├── api/          # Express REST API (port 3001)
│   ├── web/          # Next.js dashboard (port 3000)
│   └── worker/       # Background job processor
├── packages/
│   └── types/        # Shared Zod schemas & TypeScript types
├── docker-compose.yml
└── turbo.json
```

---

## Local setup

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A [Clerk](https://clerk.com) account (free tier)

### 1. Clone & install

```bash
git clone https://github.com/nrana-pixel/AgentGraph.git
cd AgentGraph
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your Clerk keys (everything else works out of the box):

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
```

Get these from your [Clerk dashboard](https://dashboard.clerk.com) → API Keys.
For the webhook secret: Clerk dashboard → Webhooks → Add endpoint → `http://localhost:3001/v1/auth/webhooks/clerk`.

### 3. Start infrastructure

```bash
docker compose up postgres redis -d
```

### 4. Migrate & seed

```bash
cd apps/api
npm run db:migrate   # creates all tables + FTS index
npm run db:seed      # loads 83 tools across 15 categories
cd ../..
```

### 5. Start the app

```bash
npm run dev          # starts api + web + worker via Turborepo
```

Or separately:

```bash
# Terminal 1
cd apps/api && npm run dev

# Terminal 2
cd apps/worker && npm run dev

# Terminal 3
cd apps/web && npm run dev
```

### 6. Open

| URL | Description |
|---|---|
| `http://localhost:3000` | Dashboard |
| `http://localhost:3001/health` | API health check |
| `http://localhost:3000/tools` | Tool catalog |
| `http://localhost:3000/recommendations` | Recommendation engine |

---

## API overview

All endpoints require a Bearer token — either an `ag_*` project API key (SDK) or a Clerk session JWT (dashboard).

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/ingest` | Ingest a trace with steps |
| `GET` | `/v1/traces` | List traces (paginated, filterable) |
| `GET` | `/v1/traces/:id` | Get trace + all steps |
| `GET` | `/v1/tools` | List tool catalog |
| `GET` | `/v1/tools/:slug` | Tool profile + global stats |
| `GET` | `/v1/tools/recommend` | Get ranked recommendations for a task |
| `POST` | `/v1/projects` | Create a project |
| `GET` | `/v1/projects/:id/stats` | Project usage stats |
| `POST` | `/v1/projects/:id/api-keys` | Generate an API key |

### Recommendation query example

```bash
curl "http://localhost:3001/v1/tools/recommend?task=send+transactional+email&limit=3" \
  -H "Authorization: Bearer ag_live_your_key"
```

### Ingest example

```bash
curl -X POST http://localhost:3001/v1/ingest \
  -H "Authorization: Bearer ag_live_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "my-agent",
    "status": "completed",
    "steps": [
      {
        "type": "llm_call",
        "name": "plan",
        "model": "gpt-4o",
        "tokenUsage": { "prompt": 500, "completion": 150 },
        "latencyMs": 1200
      },
      {
        "type": "tool_call",
        "name": "send_email",
        "toolName": "sendgrid",
        "latencyMs": 320
      }
    ]
  }'
```

---

## Tool scoring

Each tool receives a composite score (0–100):

```
score = successRate × 40%
      + latencyScore × 20%
      + popularityScore × 25%
      + sentimentScore × 15%
```

- **Cold-start cap:** tools with fewer than 50 real telemetry calls are capped at 70/100 and marked as `seeded`
- **Graduation:** once a tool hits 50+ calls, it switches to `telemetry` data source and scores are uncapped
- **Latency score:** normalised against the category p95 median — `max(0, 100 - (p95 / categoryMedian × 50))`

---

## Database schema

9 tables managed by Drizzle ORM:

`users` · `organizations` · `org_members` · `projects` · `api_keys` · `traces` · `trace_steps` · `tools` · `tool_stats` · `tool_global_stats` · `webhooks`

Run migrations:
```bash
cd apps/api && npm run db:migrate
```

---

## Development

```bash
npm run dev          # dev servers (all apps)
npm run build        # production build
npm run typecheck    # TypeScript check across all packages
npm run lint         # ESLint across all packages
npm run test         # Vitest (apps/api)
```

---

## Roadmap

- [x] Phase 0 — Monorepo foundation
- [x] Phase 1 — Core observability (traces, ingest, dashboard)
- [x] Phase 2 — Tool Intelligence Graph (catalog, FTS, recommendations)
- [ ] Phase 3 — SDK auto-instrumentation
- [ ] Phase 4 — Polish & GTM (billing, alerts, public docs)
