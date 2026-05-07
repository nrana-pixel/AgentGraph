"use client";

import { useState } from "react";
import Link from "next/link";

const CATEGORY_OPTIONS = [
  { value: "", label: "Any category" },
  { value: "auth", label: "Auth" },
  { value: "email", label: "Email" },
  { value: "analytics", label: "Analytics" },
  { value: "queue", label: "Queue" },
  { value: "database", label: "Database" },
  { value: "vector_db", label: "Vector DB" },
  { value: "crm", label: "CRM" },
  { value: "payments", label: "Payments" },
  { value: "storage", label: "Storage" },
  { value: "search", label: "Search" },
  { value: "monitoring", label: "Monitoring" },
  { value: "communication", label: "Communication" },
  { value: "ai_gateway", label: "AI Gateway" },
  { value: "llm_provider", label: "LLM Provider" },
  { value: "other", label: "Other" },
];

interface Recommendation {
  slug: string;
  name: string;
  category: string;
  score: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  popularityScore: number | null;
  sentimentScore: number | null;
  isOpenSource: boolean;
  isSelfHostable: boolean;
  pricingModel: string | null;
  dataResidency: string[];
  reason: string;
  dataSource: string;
  website: string | null;
  docsUrl: string | null;
}

interface RecommendResponse {
  task: string;
  recommendations: Recommendation[];
  dataFreshness: string;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

export default function RecommendationsClient({ token }: { token: string }) {
  const [task, setTask] = useState("");
  const [category, setCategory] = useState("");
  const [selfHosted, setSelfHosted] = useState(false);
  const [openSource, setOpenSource] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({ task: task.trim(), limit: "5" });
      if (category) params.set("category", category);
      if (selfHosted) params.set("selfHosted", "true");
      if (openSource) params.set("openSource", "true");

      const res = await fetch(`${API_BASE}/v1/tools/recommend?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }

      setResult(await res.json() as RecommendResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Filter form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-border bg-card p-5 space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="task" className="text-sm font-medium">
            Describe your task
          </label>
          <input
            id="task"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. send transactional emails to users after sign-up"
            className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            required
          />
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="space-y-1.5">
            <label htmlFor="category" className="text-sm font-medium">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2 pb-0.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selfHosted}
                onChange={(e) => setSelfHosted(e.target.checked)}
                className="rounded border-border"
              />
              Self-hostable only
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={openSource}
                onChange={(e) => setOpenSource(e.target.checked)}
                className="rounded border-border"
              />
              Open source only
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !task.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Finding tools…" : "Get recommendations"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {result.recommendations.length} recommendations for &ldquo;{result.task}&rdquo;
            </span>
            <span>
              Data as of {new Date(result.dataFreshness).toLocaleDateString()}
            </span>
          </div>

          {result.recommendations.map((rec, idx) => (
            <RecommendationCard key={rec.slug} rec={rec} rank={idx + 1} />
          ))}

          {result.recommendations.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <p className="font-medium">No matching tools found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Try a broader task description or remove constraints.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecommendationCard({
  rec,
  rank,
}: {
  rec: Recommendation;
  rank: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const isColdStart = rec.dataSource === "seeded";

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-4 p-4">
        {/* Rank */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {rank}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Link
                href={`/tools/${rec.slug}`}
                className="font-semibold hover:underline"
              >
                {rec.name}
              </Link>
              {isColdStart && (
                <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-400">
                  est.
                </span>
              )}
            </div>
            {/* Composite score */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Score</span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  rec.score >= 80
                    ? "text-emerald-400"
                    : rec.score >= 60
                      ? "text-amber-400"
                      : "text-red-400"
                }`}
              >
                {rec.score.toFixed(1)}
              </span>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{rec.reason}</p>

          {/* Score bars */}
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {rec.successRate != null && (
              <MiniScore
                label="Reliability"
                value={rec.successRate * 100}
                color="bg-emerald-500"
              />
            )}
            {rec.popularityScore != null && (
              <MiniScore
                label="Popularity"
                value={rec.popularityScore}
                color="bg-blue-500"
              />
            )}
            {rec.sentimentScore != null && (
              <MiniScore
                label="Sentiment"
                value={rec.sentimentScore}
                color="bg-violet-500"
              />
            )}
            {rec.avgLatencyMs != null && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Avg latency</p>
                <p className="text-xs font-medium">{Math.round(rec.avgLatencyMs)}ms</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expandable details */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full border-t border-border px-4 py-2 text-left text-xs text-muted-foreground hover:bg-muted/20 flex items-center justify-between"
      >
        <span>Details</span>
        <span>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/10 p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Detail label="Category" value={rec.category} />
          <Detail label="Pricing" value={rec.pricingModel ?? "—"} />
          <Detail label="Open source" value={rec.isOpenSource ? "Yes" : "No"} />
          <Detail label="Self-hostable" value={rec.isSelfHostable ? "Yes" : "No"} />
          <Detail
            label="Data residency"
            value={rec.dataResidency.length > 0 ? rec.dataResidency.join(", ") : "—"}
          />
          {rec.p95LatencyMs != null && (
            <Detail label="p95 latency" value={`${Math.round(rec.p95LatencyMs)}ms`} />
          )}
          <div className="col-span-full mt-1 flex gap-3">
            {rec.website && (
              <a
                href={rec.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Website ↗
              </a>
            )}
            {rec.docsUrl && (
              <a
                href={rec.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >
                Docs ↗
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniScore({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.min(100, value);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value.toFixed(0)}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </>
  );
}
