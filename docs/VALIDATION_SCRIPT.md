# Customer Validation Script — Runtime Tool Selection

**Goal:** before we invest further in the discovery/routing wedge, confirm that
teams running agents in production feel real pain around tool selection AND will
pay to fix it. This script de-risks the whole roadmap (Workstream D).

**Format:** 25–30 min, 1:1, recorded with consent. Talk **20%**, listen **80%**.
Do **not** pitch AgentGraph until the very end. We are testing the problem, not
the solution.

**Target:** 10–15 interviews. Bias toward people who own an agent in prod.

## Who to recruit

- Engineers/PMs shipping LLM agents to **production** (not demos).
- Bonus: teams whose agents use **many tools / MCP servers** (5+).
- Sources: existing waitlist, MCP/LangChain/agent communities, design partners,
  warm intros. Aim for a mix of startups and mid-size.

## Screening (async, before booking)

1. Do you have an AI agent running in production today? (need: yes)
2. Roughly how many tools / functions / MCP servers can it call?
3. What's your role?

---

## Interview guide

### 1. Context (warm up, ~5 min)
- Tell me about your agent — what does it do, who uses it?
- How long has it been in production? How much traffic?
- Walk me through the tools/functions it can call.

### 2. The problem space (the core, ~12 min) — *do not lead*
- How did you decide **which tools** to give the agent access to?
- When the agent has to pick a tool, how well does that go? Tell me about the
  last time it picked the **wrong** one.
- *(If many tools)* Have you hit issues as the toolset grew — accuracy, latency,
  context size, cost? Describe a specific incident.
- How do you currently debug a bad tool choice? Who notices, and how?
- What have you tried to improve tool selection? How well did it work?
- **Cost question (key):** When the agent picks the wrong tool, what does it
  cost you — wasted spend, latency, a bad user outcome, eng time? Can you
  put a rough number on it?

### 3. Today's workarounds
- How do you decide if Tool A is "better" than Tool B for a job today?
- Do you ever wish you knew how a tool performs for *others*, not just you?
- Walk me through what happens when you want to add or swap a tool.

### 4. Willingness to pay (~5 min)
- If something reliably told your agent the best tool for each task **at
  runtime**, how valuable would that be — and to whom on your team?
- What would have to be true for you to **pay** for it? What's a no?
- Who controls that budget? What's your current spend on observability/agent infra?

### 5. Reveal + reaction (last ~5 min only)
- One-line pitch: *"AgentGraph ranks tools by real-world reliability/latency/
  your own history and serves the best one — with its schema — at runtime, so
  your agent isn't drowning in tool definitions."*
- Gut reaction? What's confusing or missing?
- Would you join a design-partner program? (concrete next step)

---

## Signals to capture (one row per interview)

| Field | Notes |
|---|---|
| Has prod agent | y/n |
| # tools | |
| Felt tool-selection pain (unprompted) | y/n — **the** signal |
| Concrete incident described | y/n + 1 line |
| Quantified cost of bad selection | $ / time |
| Current workaround | hardcode / eval / nothing / other |
| Willingness to pay | strong / soft / no |
| Budget owner | |
| Design partner? | y/n |

## Decision gate

- **GO (continue Workstreams A–C):** ≥ 5 of 15 describe **unprompted**,
  recurring tool-selection pain **and** express willingness to pay.
- **PIVOT:** if most say *"we just hardcode the tools"* and feel no pain →
  the runtime-routing premise is weak. Redirect toward agent **eval/debugging**
  (where the same telemetry pipeline applies) before building more.
- **Either way:** convert every enthusiastic interviewee into a design partner.

## Anti-patterns

- Don't ask "would you use X?" — ask what they do **today**.
- Don't pitch early; you'll get politeness, not truth.
- Don't accept "that'd be nice" — push for a number, a budget, a next step.
