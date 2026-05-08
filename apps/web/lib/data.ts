// AgentGraph — mock data (TypeScript port from data.jsx)

export const TOOL_CATEGORIES = [
  "auth","email","analytics","queue","database","vector_db","crm","payments",
  "storage","search","monitoring","communication","ai_gateway","llm_provider","other"
] as const;

export type ToolCategory = typeof TOOL_CATEGORIES[number];

export interface Tool {
  slug: string;
  name: string;
  category: string;
  description: string;
  website: string;
  docsUrl: string;
  githubUrl: string | null;
  isOpenSource: boolean;
  isSelfHostable: boolean;
  pricingModel: string;
  dataResidency: string[];
  tags: string[];
  dataSource: string;
  sentimentScore: string;
  successRate: string;
  avgLatencyMs: string;
  p95LatencyMs: string;
  totalCalls: number;
  popularityScore: string;
}

export const TOOLS_DATA: Tool[] = [
  { slug:"clerk", name:"Clerk", category:"auth", description:"Drop-in user management, MFA, sessions, and orgs.", website:"https://clerk.com", docsUrl:"https://clerk.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu"], tags:["jwt","oauth","passkeys"], dataSource:"telemetry", sentimentScore:"0.86", successRate:"0.9931", avgLatencyMs:"142", p95LatencyMs:"380", totalCalls:18400, popularityScore:"0.92" },
  { slug:"auth0", name:"Auth0", category:"auth", description:"Universal login + extensible rules engine.", website:"https://auth0.com", docsUrl:"https://auth0.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu","au"], tags:["oauth","saml","enterprise"], dataSource:"telemetry", sentimentScore:"0.78", successRate:"0.9871", avgLatencyMs:"168", p95LatencyMs:"412", totalCalls:9220, popularityScore:"0.81" },
  { slug:"supabase-auth", name:"Supabase Auth", category:"auth", description:"Postgres-native auth with row-level security.", website:"https://supabase.com", docsUrl:"https://supabase.com/docs/guides/auth", githubUrl:"https://github.com/supabase/auth", isOpenSource:true, isSelfHostable:true, pricingModel:"open_source", dataResidency:["us","eu","ap"], tags:["postgres","rls","jwt"], dataSource:"telemetry", sentimentScore:"0.83", successRate:"0.9902", avgLatencyMs:"118", p95LatencyMs:"302", totalCalls:6810, popularityScore:"0.74" },

  { slug:"resend", name:"Resend", category:"email", description:"Developer-first transactional email API.", website:"https://resend.com", docsUrl:"https://resend.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu"], tags:["smtp","react-email"], dataSource:"telemetry", sentimentScore:"0.91", successRate:"0.9986", avgLatencyMs:"94", p95LatencyMs:"186", totalCalls:14290, popularityScore:"0.88" },
  { slug:"postmark", name:"Postmark", category:"email", description:"High-deliverability transactional email.", website:"https://postmarkapp.com", docsUrl:"https://postmarkapp.com/developer", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us"], tags:["transactional"], dataSource:"telemetry", sentimentScore:"0.84", successRate:"0.9978", avgLatencyMs:"112", p95LatencyMs:"240", totalCalls:5410, popularityScore:"0.71" },
  { slug:"sendgrid", name:"SendGrid", category:"email", description:"Twilio-owned email at scale.", website:"https://sendgrid.com", docsUrl:"https://docs.sendgrid.com", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu"], tags:["marketing","transactional"], dataSource:"seeded", sentimentScore:"0.62", successRate:"0.9890", avgLatencyMs:"180", p95LatencyMs:"480", totalCalls:42, popularityScore:"0.68" },

  { slug:"posthog", name:"PostHog", category:"analytics", description:"Open-source product analytics + session replay.", website:"https://posthog.com", docsUrl:"https://posthog.com/docs", githubUrl:"https://github.com/posthog/posthog", isOpenSource:true, isSelfHostable:true, pricingModel:"open_source", dataResidency:["us","eu"], tags:["events","funnels","replay"], dataSource:"telemetry", sentimentScore:"0.88", successRate:"0.9921", avgLatencyMs:"86", p95LatencyMs:"210", totalCalls:31200, popularityScore:"0.85" },
  { slug:"segment", name:"Segment", category:"analytics", description:"Customer data infrastructure & routing.", website:"https://segment.com", docsUrl:"https://segment.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu"], tags:["cdp","routing"], dataSource:"telemetry", sentimentScore:"0.74", successRate:"0.9854", avgLatencyMs:"148", p95LatencyMs:"392", totalCalls:7720, popularityScore:"0.72" },

  { slug:"sqs", name:"AWS SQS", category:"queue", description:"Managed message queueing service.", website:"https://aws.amazon.com/sqs", docsUrl:"https://docs.aws.amazon.com/sqs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu","ap","sa"], tags:["fifo","standard"], dataSource:"telemetry", sentimentScore:"0.72", successRate:"0.9990", avgLatencyMs:"38", p95LatencyMs:"96", totalCalls:88300, popularityScore:"0.78" },
  { slug:"upstash-qstash", name:"Upstash QStash", category:"queue", description:"Serverless message queue with HTTP API.", website:"https://upstash.com/qstash", docsUrl:"https://upstash.com/docs/qstash", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu","ap"], tags:["http","serverless"], dataSource:"telemetry", sentimentScore:"0.86", successRate:"0.9961", avgLatencyMs:"62", p95LatencyMs:"148", totalCalls:12100, popularityScore:"0.69" },

  { slug:"postgres", name:"Postgres", category:"database", description:"The world's most advanced open-source RDBMS.", website:"https://postgresql.org", docsUrl:"https://postgresql.org/docs", githubUrl:"https://github.com/postgres/postgres", isOpenSource:true, isSelfHostable:true, pricingModel:"open_source", dataResidency:["self"], tags:["sql","acid","jsonb"], dataSource:"telemetry", sentimentScore:"0.94", successRate:"0.9995", avgLatencyMs:"12", p95LatencyMs:"34", totalCalls:212000, popularityScore:"0.96" },
  { slug:"planetscale", name:"PlanetScale", category:"database", description:"Serverless MySQL with branching.", website:"https://planetscale.com", docsUrl:"https://planetscale.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu","ap"], tags:["mysql","vitess","branching"], dataSource:"telemetry", sentimentScore:"0.82", successRate:"0.9942", avgLatencyMs:"22", p95LatencyMs:"68", totalCalls:8400, popularityScore:"0.74" },
  { slug:"neon", name:"Neon", category:"database", description:"Serverless Postgres with branches.", website:"https://neon.tech", docsUrl:"https://neon.tech/docs", githubUrl:"https://github.com/neondatabase/neon", isOpenSource:true, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu","ap"], tags:["postgres","serverless","branching"], dataSource:"telemetry", sentimentScore:"0.89", successRate:"0.9968", avgLatencyMs:"18", p95LatencyMs:"54", totalCalls:14600, popularityScore:"0.81" },

  { slug:"pinecone", name:"Pinecone", category:"vector_db", description:"Managed vector database for RAG.", website:"https://pinecone.io", docsUrl:"https://docs.pinecone.io", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu","ap"], tags:["embeddings","ann","rag"], dataSource:"telemetry", sentimentScore:"0.81", successRate:"0.9924", avgLatencyMs:"58", p95LatencyMs:"148", totalCalls:22100, popularityScore:"0.86" },
  { slug:"qdrant", name:"Qdrant", category:"vector_db", description:"Open-source vector database in Rust.", website:"https://qdrant.tech", docsUrl:"https://qdrant.tech/documentation", githubUrl:"https://github.com/qdrant/qdrant", isOpenSource:true, isSelfHostable:true, pricingModel:"open_source", dataResidency:["us","eu","self"], tags:["rust","hnsw","filters"], dataSource:"telemetry", sentimentScore:"0.87", successRate:"0.9912", avgLatencyMs:"42", p95LatencyMs:"118", totalCalls:9200, popularityScore:"0.78" },
  { slug:"weaviate", name:"Weaviate", category:"vector_db", description:"AI-native vector database.", website:"https://weaviate.io", docsUrl:"https://weaviate.io/developers", githubUrl:"https://github.com/weaviate/weaviate", isOpenSource:true, isSelfHostable:true, pricingModel:"open_source", dataResidency:["us","eu","self"], tags:["graphql","hybrid"], dataSource:"telemetry", sentimentScore:"0.79", successRate:"0.9890", avgLatencyMs:"66", p95LatencyMs:"172", totalCalls:4200, popularityScore:"0.65" },

  { slug:"hubspot", name:"HubSpot CRM", category:"crm", description:"All-in-one CRM with marketing + sales hubs.", website:"https://hubspot.com", docsUrl:"https://developers.hubspot.com", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu"], tags:["marketing","sales","contacts"], dataSource:"telemetry", sentimentScore:"0.71", successRate:"0.9842", avgLatencyMs:"212", p95LatencyMs:"540", totalCalls:6100, popularityScore:"0.73" },
  { slug:"attio", name:"Attio", category:"crm", description:"Powerful, flexible relational CRM.", website:"https://attio.com", docsUrl:"https://attio.com/developers", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu"], tags:["relational","collaborative"], dataSource:"seeded", sentimentScore:"0.80", successRate:"0.9930", avgLatencyMs:"180", p95LatencyMs:"420", totalCalls:34, popularityScore:"0.62" },

  { slug:"stripe", name:"Stripe", category:"payments", description:"Internet payments infrastructure.", website:"https://stripe.com", docsUrl:"https://stripe.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu","ap"], tags:["cards","subscriptions","billing"], dataSource:"telemetry", sentimentScore:"0.93", successRate:"0.9982", avgLatencyMs:"168", p95LatencyMs:"420", totalCalls:54200, popularityScore:"0.95" },
  { slug:"lemon-squeezy", name:"Lemon Squeezy", category:"payments", description:"Merchant of record for digital products.", website:"https://lemonsqueezy.com", docsUrl:"https://docs.lemonsqueezy.com", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu"], tags:["mor","tax"], dataSource:"telemetry", sentimentScore:"0.85", successRate:"0.9912", avgLatencyMs:"220", p95LatencyMs:"540", totalCalls:2100, popularityScore:"0.61" },

  { slug:"s3", name:"AWS S3", category:"storage", description:"Object storage built to retrieve any amount.", website:"https://aws.amazon.com/s3", docsUrl:"https://docs.aws.amazon.com/s3", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu","ap","sa"], tags:["s3","blob"], dataSource:"telemetry", sentimentScore:"0.84", successRate:"0.9994", avgLatencyMs:"42", p95LatencyMs:"112", totalCalls:124000, popularityScore:"0.93" },
  { slug:"r2", name:"Cloudflare R2", category:"storage", description:"S3-compatible object storage, no egress fees.", website:"https://cloudflare.com/r2", docsUrl:"https://developers.cloudflare.com/r2", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["global"], tags:["s3-compat","cdn"], dataSource:"telemetry", sentimentScore:"0.90", successRate:"0.9971", avgLatencyMs:"38", p95LatencyMs:"104", totalCalls:18900, popularityScore:"0.79" },

  { slug:"algolia", name:"Algolia", category:"search", description:"Hosted search-as-a-service.", website:"https://algolia.com", docsUrl:"https://algolia.com/doc", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu","ap"], tags:["typo","ranking"], dataSource:"telemetry", sentimentScore:"0.83", successRate:"0.9961", avgLatencyMs:"28", p95LatencyMs:"82", totalCalls:42000, popularityScore:"0.80" },
  { slug:"meilisearch", name:"Meilisearch", category:"search", description:"Lightning-fast, open-source search.", website:"https://meilisearch.com", docsUrl:"https://meilisearch.com/docs", githubUrl:"https://github.com/meilisearch/meilisearch", isOpenSource:true, isSelfHostable:true, pricingModel:"open_source", dataResidency:["self"], tags:["typo","fuzzy"], dataSource:"telemetry", sentimentScore:"0.88", successRate:"0.9928", avgLatencyMs:"22", p95LatencyMs:"68", totalCalls:6800, popularityScore:"0.71" },

  { slug:"sentry", name:"Sentry", category:"monitoring", description:"Application performance & error monitoring.", website:"https://sentry.io", docsUrl:"https://docs.sentry.io", githubUrl:"https://github.com/getsentry/sentry", isOpenSource:true, isSelfHostable:true, pricingModel:"freemium", dataResidency:["us","eu"], tags:["errors","apm","tracing"], dataSource:"telemetry", sentimentScore:"0.86", successRate:"0.9968", avgLatencyMs:"54", p95LatencyMs:"142", totalCalls:38400, popularityScore:"0.87" },
  { slug:"datadog", name:"Datadog", category:"monitoring", description:"Cloud-scale observability platform.", website:"https://datadoghq.com", docsUrl:"https://docs.datadoghq.com", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu","ap"], tags:["metrics","logs","apm"], dataSource:"telemetry", sentimentScore:"0.69", successRate:"0.9941", avgLatencyMs:"82", p95LatencyMs:"220", totalCalls:14200, popularityScore:"0.84" },

  { slug:"slack", name:"Slack API", category:"communication", description:"Channel-based messaging for teams.", website:"https://api.slack.com", docsUrl:"https://api.slack.com", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us","eu"], tags:["webhooks","bots"], dataSource:"telemetry", sentimentScore:"0.78", successRate:"0.9912", avgLatencyMs:"108", p95LatencyMs:"280", totalCalls:21800, popularityScore:"0.82" },
  { slug:"twilio", name:"Twilio", category:"communication", description:"SMS, voice, and verification APIs.", website:"https://twilio.com", docsUrl:"https://twilio.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu","au"], tags:["sms","voice","verify"], dataSource:"telemetry", sentimentScore:"0.74", successRate:"0.9885", avgLatencyMs:"320", p95LatencyMs:"780", totalCalls:9100, popularityScore:"0.78" },

  { slug:"openrouter", name:"OpenRouter", category:"ai_gateway", description:"Unified API across LLM providers.", website:"https://openrouter.ai", docsUrl:"https://openrouter.ai/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu"], tags:["routing","fallbacks"], dataSource:"telemetry", sentimentScore:"0.84", successRate:"0.9921", avgLatencyMs:"680", p95LatencyMs:"1840", totalCalls:18900, popularityScore:"0.76" },
  { slug:"portkey", name:"Portkey", category:"ai_gateway", description:"AI gateway with caching and observability.", website:"https://portkey.ai", docsUrl:"https://portkey.ai/docs", githubUrl:"https://github.com/Portkey-AI/gateway", isOpenSource:true, isSelfHostable:true, pricingModel:"freemium", dataResidency:["us","eu","self"], tags:["cache","fallbacks","trace"], dataSource:"telemetry", sentimentScore:"0.82", successRate:"0.9908", avgLatencyMs:"720", p95LatencyMs:"1980", totalCalls:4400, popularityScore:"0.64" },

  { slug:"anthropic", name:"Anthropic", category:"llm_provider", description:"Claude models for agentic workloads.", website:"https://anthropic.com", docsUrl:"https://docs.anthropic.com", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us"], tags:["claude","tool-use","sonnet"], dataSource:"telemetry", sentimentScore:"0.92", successRate:"0.9945", avgLatencyMs:"1240", p95LatencyMs:"3200", totalCalls:88200, popularityScore:"0.91" },
  { slug:"openai", name:"OpenAI", category:"llm_provider", description:"GPT models and embeddings API.", website:"https://openai.com", docsUrl:"https://platform.openai.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"paid", dataResidency:["us","eu"], tags:["gpt","embeddings"], dataSource:"telemetry", sentimentScore:"0.86", successRate:"0.9912", avgLatencyMs:"1480", p95LatencyMs:"3800", totalCalls:124000, popularityScore:"0.94" },
  { slug:"groq", name:"Groq", category:"llm_provider", description:"Ultra-low-latency inference on LPUs.", website:"https://groq.com", docsUrl:"https://console.groq.com/docs", githubUrl:null, isOpenSource:false, isSelfHostable:false, pricingModel:"freemium", dataResidency:["us"], tags:["lpu","fast","llama"], dataSource:"telemetry", sentimentScore:"0.89", successRate:"0.9871", avgLatencyMs:"180", p95LatencyMs:"480", totalCalls:11200, popularityScore:"0.72" },
];

export const AGENTS = [
  "support-triage",
  "code-reviewer",
  "research-synth",
  "lead-enrichment",
  "doc-qa",
  "billing-resolver",
  "outbound-drafter",
] as const;

export type AgentId = typeof AGENTS[number];

// Deterministic PRNG for stable mock data
function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

export interface Trace {
  id: string;
  agentId: string;
  sessionId: string | null;
  userId: string | null;
  env: string;
  status: "running" | "error" | "completed";
  totalLatencyMs: number | null;
  totalTokens: number | null;
  totalCostUsd: string | null;
  metadata: string;
  startedAt: string;
  endedAt: string | null;
}

function makeTrace(i: number): Trace {
  const id = `t_${(0xa3f200 + i * 117).toString(16).padStart(8, "0")}`;
  const agentId = pick(AGENTS);
  const statusRoll = rand();
  const status: Trace["status"] = i < 2 ? "running" : statusRoll < 0.08 ? "error" : "completed";
  const env = rand() < 0.7 ? "prod" : rand() < 0.6 ? "dev" : "staging";
  const startedAt = new Date(Date.now() - i * 1000 * 60 * (4 + rand() * 8)).toISOString();
  const totalLatencyMs = status === "running" ? null : Math.floor(800 + rand() * 9200);
  const totalTokens = status === "running" ? null : Math.floor(400 + rand() * 18000);
  const totalCostUsd = status === "running" ? null : (totalTokens! * 0.0000028 + 0.0008).toFixed(6);
  return {
    id,
    agentId,
    sessionId: rand() < 0.6 ? `s_${Math.floor(rand() * 9999)}` : null,
    userId: rand() < 0.5 ? `u_${Math.floor(rand() * 99999)}` : null,
    env,
    status,
    totalLatencyMs,
    totalTokens,
    totalCostUsd,
    metadata: JSON.stringify({ source: pick(["web","cron","api","slack"]), version: "v" + Math.floor(2 + rand() * 4) + "." + Math.floor(rand() * 12) }),
    startedAt,
    endedAt: status === "running" ? null : new Date(new Date(startedAt).getTime() + totalLatencyMs!).toISOString(),
  };
}

export const TRACES_DATA: Trace[] = Array.from({ length: 64 }, (_, i) => makeTrace(i));

interface StepTemplate {
  type: string;
  name: string;
  model: string | null;
  toolName: string | null;
  lat: [number, number];
}

const STEP_TEMPLATES: Record<string, StepTemplate[]> = {
  "support-triage": [
    { type: "llm_call", name: "classify-intent", model: "claude-haiku-4-5", toolName: null, lat: [180, 320] },
    { type: "retrieval", name: "lookup-similar-tickets", model: null, toolName: "pinecone", lat: [38, 78] },
    { type: "llm_call", name: "draft-response", model: "claude-sonnet-4-5", toolName: null, lat: [1400, 2200] },
    { type: "tool_call", name: "send-email", model: null, toolName: "resend", lat: [80, 140] },
    { type: "tool_call", name: "log-event", model: null, toolName: "posthog", lat: [40, 90] },
  ],
  "code-reviewer": [
    { type: "tool_call", name: "fetch-pr-diff", model: null, toolName: "github", lat: [120, 240] },
    { type: "llm_call", name: "analyze-changes", model: "claude-sonnet-4-5", toolName: null, lat: [2200, 3600] },
    { type: "tool_call", name: "post-review", model: null, toolName: "github", lat: [180, 320] },
  ],
  "research-synth": [
    { type: "tool_call", name: "web-search", model: null, toolName: "tavily", lat: [400, 800] },
    { type: "retrieval", name: "search-knowledge-base", model: null, toolName: "qdrant", lat: [40, 90] },
    { type: "llm_call", name: "synthesize-findings", model: "claude-opus-4-5", toolName: null, lat: [3200, 5400] },
    { type: "tool_call", name: "save-report", model: null, toolName: "s3", lat: [40, 80] },
  ],
  "lead-enrichment": [
    { type: "tool_call", name: "find-contact", model: null, toolName: "hubspot", lat: [200, 360] },
    { type: "tool_call", name: "enrich-data", model: null, toolName: "clearbit", lat: [300, 540] },
    { type: "llm_call", name: "score-lead", model: "claude-haiku-4-5", toolName: null, lat: [220, 420] },
    { type: "tool_call", name: "update-crm", model: null, toolName: "hubspot", lat: [180, 320] },
  ],
  "doc-qa": [
    { type: "retrieval", name: "vector-search", model: null, toolName: "pinecone", lat: [50, 100] },
    { type: "llm_call", name: "answer-question", model: "claude-sonnet-4-5", toolName: null, lat: [1800, 2800] },
    { type: "tool_call", name: "log-feedback", model: null, toolName: "posthog", lat: [40, 80] },
  ],
  "billing-resolver": [
    { type: "tool_call", name: "fetch-customer", model: null, toolName: "stripe", lat: [120, 220] },
    { type: "tool_call", name: "fetch-invoice", model: null, toolName: "stripe", lat: [110, 200] },
    { type: "llm_call", name: "diagnose-issue", model: "claude-sonnet-4-5", toolName: null, lat: [1600, 2600] },
    { type: "tool_call", name: "issue-refund", model: null, toolName: "stripe", lat: [240, 420] },
    { type: "human", name: "approval-required", model: null, toolName: null, lat: [12000, 60000] },
  ],
  "outbound-drafter": [
    { type: "retrieval", name: "fetch-context", model: null, toolName: "qdrant", lat: [40, 90] },
    { type: "llm_call", name: "draft-message", model: "claude-sonnet-4-5", toolName: null, lat: [1200, 2200] },
    { type: "tool_call", name: "send-message", model: null, toolName: "slack", lat: [120, 240] },
  ],
};

export interface TraceStep {
  id: string;
  traceId: string;
  stepIndex: number;
  type: string;
  name: string;
  input: string;
  output: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: string | null;
  error: string | null;
  model: string | null;
  toolName: string | null;
  toolVersion: string | null;
  timestamp: string;
}

export function makeStepsForTrace(trace: Trace, idx: number): TraceStep[] {
  const tpl = STEP_TEMPLATES[trace.agentId] || STEP_TEMPLATES["doc-qa"];
  const r = mulberry32(idx + 1);
  const errorAt = trace.status === "error" ? Math.floor(r() * tpl.length) : -1;
  let cursor = new Date(trace.startedAt).getTime();
  return tpl.map((s, i) => {
    const lat = Math.floor(s.lat[0] + r() * (s.lat[1] - s.lat[0]));
    const promptTokens = s.type === "llm_call" ? Math.floor(200 + r() * 2400) : null;
    const completionTokens = s.type === "llm_call" ? Math.floor(80 + r() * 800) : null;
    const totalTokens = promptTokens != null ? promptTokens + completionTokens! : null;
    const costUsd = totalTokens != null ? (totalTokens * 0.000003).toFixed(6) : null;
    const ts = new Date(cursor).toISOString();
    cursor += lat;
    const isErr = i === errorAt;
    return {
      id: `${trace.id}_s${i}`,
      traceId: trace.id,
      stepIndex: i,
      type: s.type,
      name: s.name,
      input: JSON.stringify(s.type === "llm_call"
        ? { messages: [{ role: "user", content: "Investigate the customer's recent failed payment and recommend next steps." }], temperature: 0.2 }
        : s.type === "retrieval"
          ? { query: "duplicate-charge resolution policy", topK: 6, namespace: "support" }
          : { customer_id: "cus_QbA9k3mZ", amount: 4900, currency: "usd" }),
      output: JSON.stringify(isErr
        ? { error: "rate_limited", retryable: true }
        : s.type === "llm_call"
          ? { content: "The customer was double-charged due to a webhook race. Refund the second charge and send a confirmation email.", finishReason: "stop" }
          : s.type === "retrieval"
            ? { matches: [{ id: "doc_1", score: 0.94 }, { id: "doc_2", score: 0.88 }], count: 6 }
            : { ok: true, id: "evt_" + Math.floor(r() * 9e9).toString(36) }),
      latencyMs: lat,
      promptTokens,
      completionTokens,
      totalTokens,
      costUsd,
      error: isErr ? "Provider returned 429: rate_limited" : null,
      model: s.model,
      toolName: s.toolName,
      toolVersion: s.toolName ? "1." + Math.floor(r() * 12) + "." + Math.floor(r() * 8) : null,
      timestamp: ts,
    };
  });
}

// Stats
interface DaySeries {
  date: string;
  traces: number;
  tokens: number;
  errors: number;
}

interface Stats {
  totals: {
    traces: number;
    tokens: number;
    costUsd: string;
    errors: number;
  };
  topAgents: { agentId: string; count: number }[];
  topTools: { toolName: string; count: number }[];
  dailySeries: DaySeries[];
}

function buildStats(): Stats {
  const totals = TRACES_DATA.reduce((a, t) => ({
    traces: a.traces + 1,
    tokens: a.tokens + (t.totalTokens || 0),
    costUsd: a.costUsd + parseFloat(t.totalCostUsd || "0"),
    errors: a.errors + (t.status === "error" ? 1 : 0),
  }), { traces: 0, tokens: 0, costUsd: 0, errors: 0 });

  const byAgent: Record<string, number> = {};
  TRACES_DATA.forEach(t => { byAgent[t.agentId] = (byAgent[t.agentId] || 0) + 1; });
  const topAgents = Object.entries(byAgent).map(([agentId, count]) => ({ agentId, count })).sort((a, b) => b.count - a.count);

  const byTool: Record<string, number> = {};
  TRACES_DATA.forEach((t, i) => {
    const steps = makeStepsForTrace(t, i);
    steps.forEach(s => { if (s.toolName) byTool[s.toolName] = (byTool[s.toolName] || 0) + 1; });
  });
  const topTools = Object.entries(byTool).map(([toolName, count]) => ({ toolName, count })).sort((a, b) => b.count - a.count).slice(0, 6);

  const days = 14;
  const dailySeries = Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86400000);
    const r = mulberry32(i + 7);
    return {
      date: d.toISOString().slice(0, 10),
      traces: Math.floor(140 + r() * 220 + i * 8),
      tokens: Math.floor(180000 + r() * 220000),
      errors: Math.floor(r() * 14),
    };
  });

  return { totals: { ...totals, costUsd: totals.costUsd.toFixed(4) }, topAgents, topTools, dailySeries };
}

export const STATS = buildStats();

export const API_KEYS_INITIAL = [
  { id: "k_01", name: "Production server", prefix: "ag_live_4f9k...n2pQ", lastUsed: "2 min ago", createdAt: "2026-04-12T10:31:00Z" },
  { id: "k_02", name: "Staging worker", prefix: "ag_live_8a2x...rT3v", lastUsed: "1 hr ago", createdAt: "2026-03-08T14:02:00Z" },
  { id: "k_03", name: "CI tests", prefix: "ag_live_z71m...kQ8b", lastUsed: "3 days ago", createdAt: "2026-01-22T09:11:00Z" },
];

export const STEPS_DATA: Record<string, TraceStep[]> = {};
TRACES_DATA.forEach((t, i) => {
  STEPS_DATA[t.id] = makeStepsForTrace(t, i);
});
