"use client";
import { useState, useEffect } from "react";
import { fmtMoney, fmtNum } from "@/lib/format";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";

type Period = "7d" | "30d" | "90d";

const PERIOD_DAYS: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90 };

interface StatsResponse {
  totals: { traceCount: number; totalCostUsd: number; totalTokens: number; errorRate: number };
  dailyStats: { date: string; totalCostUsd: number; traceCount: number; totalTokens: number }[];
  costByModel: { model: string | null; totalCostUsd: number; totalTokens: number; callCount: number }[];
  topAgents: { agentId: string; traceCount: number; errorRate: number; totalTokens: number; totalCostUsd: number }[];
}

function BarChart({ series }: { series: { date: string; costUsd: number }[] }) {
  const max = Math.max(...series.map(d => d.costUsd), 0.01);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ alignItems: "flex-end", gap: 3, height: 160 }}>
        {series.map((d, i) => (
          <div key={i} title={`${d.date}: ${fmtMoney(d.costUsd)}`}
               style={{ flex: 1, height: (d.costUsd / max) * 100 + "%", background: "linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 40%, transparent))", borderRadius: 2, minHeight: 2, cursor: "default" }}/>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
        <span>{series[0]?.date}</span>
        <span>{series[Math.floor(series.length / 2)]?.date}</span>
        <span>{series[series.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function MeterBar({ used, limit, tone }: { used: number; limit: number; tone?: "ok" | "warn" | "err" }) {
  const pct = Math.min(1, used / limit) * 100;
  const color = tone === "err" ? "var(--error)" : tone === "warn" ? "var(--warn)" : "var(--success)";
  return (
    <div className="bar" style={{ height: 8 }}>
      <div className="bar-fill" style={{ width: pct + "%", background: color }}/>
    </div>
  );
}

export default function CostExplorerPageClient() {
  const { project, token, loading: projectLoading } = useProject();
  const [period, setPeriod] = useState<Period>("30d");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [billing, setBilling] = useState<{ plan: string; tracesUsed: number; tracesLimit: number; usagePct: number } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project || !token) return;
    setFetching(true);
    setError(null);
    const days = PERIOD_DAYS[period];
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    const to = new Date().toISOString();

    Promise.all([
      apiGet<StatsResponse>(`/v1/projects/${project.id}/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token),
      apiGet<{ plan: string; tracesUsed: number; tracesLimit: number; usagePct: number }>(`/v1/projects/${project.id}/billing`, token),
    ])
      .then(([s, b]) => { setStats(s); setBilling(b); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load data"))
      .finally(() => setFetching(false));
  }, [project, token, period]);

  if (error) {
    return (
      <div className="fade-up">
        <div className="page-h"><div><h1>Cost Explorer</h1><div className="sub">LLM spend breakdown by time, model, and agent.</div></div></div>
        <div className="card card-pad" style={{ textAlign: "center" }}>
          <div className="muted" style={{ marginBottom: 12 }}>{error}</div>
          <button className="btn" onClick={() => { setError(null); setStats(null); setBilling(null); }}>Retry</button>
        </div>
      </div>
    );
  }

  if (projectLoading || fetching || !stats || !billing) {
    return (
      <div className="fade-up">
        <div className="page-h"><div><h1>Cost Explorer</h1><div className="sub">LLM spend breakdown by time, model, and agent.</div></div></div>
        <div className="card card-pad muted" style={{ textAlign: "center" }}>Loading…</div>
      </div>
    );
  }