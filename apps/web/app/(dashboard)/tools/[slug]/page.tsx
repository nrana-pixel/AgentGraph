import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

interface Tool {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  website: string | null;
  docsUrl: string | null;
  githubUrl: string | null;
  isOpenSource: boolean;
  isSelfHostable: boolean;
  pricingModel: string | null;
  dataResidency: string[] | null;
  tags: string[] | null;
  dataSource: string;
  sentimentScore: string | null;
}

interface ToolGlobalStats {
  toolSlug: string;
  totalCalls: number;
  successRate: string | null;
  avgLatencyMs: string | null;
  p95LatencyMs: string | null;
  popularityScore: string | null;
  lastUpdated: string | null;
}

async function fetchToolProfile(slug: string, token: string) {
  const res = await fetch(`${API_BASE}/v1/tools/${slug}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ tool: Tool; stats: ToolGlobalStats | null }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  auth: "Auth",
  email: "Email",
  analytics: "Analytics",
  queue: "Queue",
  database: "Database",
  vector_db: "Vector DB",
  crm: "CRM",
  payments: "Payments",
  storage: "Storage",
  search: "Search",
  monitoring: "Monitoring",
  communication: "Communication",
  ai_gateway: "AI Gateway",
  llm_provider: "LLM Provider",
  other: "Other",
};

export default async function ToolProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { getToken } = await auth();
  const token = (await getToken()) ?? "";

  const data = await fetchToolProfile(slug, token);
  if (!data) notFound();

  const { tool, stats } = data;
  const isColdStart = (stats?.totalCalls ?? 0) < 50;

  const successRate =
    stats?.successRate != null ? (parseFloat(stats.successRate) * 100).toFixed(2) : null;
  const avgLatency =
    stats?.avgLatencyMs != null ? Math.round(parseFloat(stats.avgLatencyMs)) : null;
  const p95Latency =
    stats?.p95LatencyMs != null ? Math.round(parseFloat(stats.p95LatencyMs)) : null;
  const popularity =
    stats?.popularityScore != null ? parseFloat(stats.popularityScore).toFixed(1) : null;
  const sentiment =
    tool.sentimentScore != null ? parseFloat(tool.sentimentScore).toFixed(0) : null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <Link
        href="/tools"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to catalog
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{tool.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {CATEGORY_LABELS[tool.category] ?? tool.category}
            {" · "}
            <span
              className={`font-medium ${isColdStart ? "text-amber-400" : "text-emerald-400"}`}
            >
              {isColdStart ? "Seeded benchmark" : "Live telemetry"}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {tool.website && (
            <a
              href={tool.website}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/30"
            >
              Website ↗
            </a>
          )}
          {tool.docsUrl && (
            <a
              href={tool.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/30"
            >
              Docs ↗
            </a>
          )}
          {tool.githubUrl && (
            <a
              href={tool.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/30"
            >
              GitHub ↗
            </a>
          )}
        </div>
      </div>

      {tool.description && (
        <p className="text-sm text-muted-foreground leading-relaxed">{tool.description}</p>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Success rate" value={successRate ? `${successRate}%` : "—"} />
        <StatCard label="Avg latency" value={avgLatency != null ? `${avgLatency}ms` : "—"} />
        <StatCard label="p95 latency" value={p95Latency != null ? `${p95Latency}ms` : "—"} />
        <StatCard
          label="Sentiment"
          value={sentiment != null ? `${sentiment}/100` : "—"}
        />
      </div>

      {/* Score bars */}
      {stats && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <h2 className="text-sm font-medium">Intelligence scores</h2>
          {successRate && (
            <ScoreBar
              label="Reliability"
              value={parseFloat(successRate)}
              max={100}
              color="bg-emerald-500"
              note={isColdStart ? "estimated" : undefined}
            />
          )}
          {popularity && (
            <ScoreBar
              label="Popularity"
              value={parseFloat(popularity)}
              max={100}
              color="bg-blue-500"
            />
          )}
          {sentiment && (
            <ScoreBar
              label="Community sentiment"
              value={parseFloat(sentiment)}
              max={100}
              color="bg-violet-500"
            />
          )}
          {stats.totalCalls > 0 && (
            <p className="text-xs text-muted-foreground">
              Based on {stats.totalCalls.toLocaleString()} telemetry calls
            </p>
          )}
        </div>
      )}

      {/* Attributes */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-medium">Attributes</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <AttributeRow label="Pricing" value={tool.pricingModel ?? "—"} />
          <AttributeRow
            label="Open source"
            value={tool.isOpenSource ? "Yes" : "No"}
          />
          <AttributeRow
            label="Self-hostable"
            value={tool.isSelfHostable ? "Yes" : "No"}
          />
          <AttributeRow
            label="Data residency"
            value={
              tool.dataResidency && tool.dataResidency.length > 0
                ? tool.dataResidency.join(", ")
                : "—"
            }
          />
        </div>
      </div>

      {/* Tags */}
      {tool.tags && tool.tags.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium">Tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {tool.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ScoreBar({
  label,
  value,
  max,
  color,
  note,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  note?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {label}
          {note && <span className="ml-1 text-muted-foreground/60">({note})</span>}
        </span>
        <span className="font-medium tabular-nums">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function AttributeRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </>
  );
}
