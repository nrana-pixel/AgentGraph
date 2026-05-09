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

  const billingTone = billing.usagePct > 0.9 ? "err" : billing.usagePct > 0.7 ? "warn" : "ok";
  const totalCostShare = stats.costByModel.reduce((a, r) => a + r.totalCostUsd, 0) || 1;

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Cost Explorer</h1>
          <div className="sub">LLM spend breakdown by time, model, and agent.</div>
        </div>
        <div className="row">
          <div className="seg">
            {(["7d", "30d", "90d"] as Period[]).map(p => (
              <button key={p} data-active={period === p ? "true" : "false"} onClick={() => setPeriod(p)}>{p}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap-card, 14px)", marginBottom: 14 }}>
        <div className="card stat"><div className="stat-label">Total spend</div><div className="stat-value">{fmtMoney(stats.totals.totalCostUsd)}</div></div>
        <div className="card stat"><div className="stat-label">Tokens</div><div className="stat-value">{fmtNum(stats.totals.totalTokens)}</div></div>
        <div className="card stat"><div className="stat-label">Traces</div><div className="stat-value">{fmtNum(stats.totals.traceCount)}</div></div>
        <div className="card stat"><div className="stat-label">Avg cost / trace</div><div className="stat-value">{fmtMoney(stats.totals.traceCount ? stats.totals.totalCostUsd / stats.totals.traceCount : 0)}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd"><h3>Daily spend</h3></div>
        <div style={{ padding: "12px 16px 16px" }}>
          <BarChart series={stats.dailyStats.map(d => ({ date: d.date, costUsd: d.totalCostUsd }))}/>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-card, 14px)", marginBottom: 14 }}>
        <div className="card">
          <div className="hd"><h3>By model</h3></div>
          <table className="tbl">
            <thead><tr><th>Model</th><th>Cost</th><th>Tokens</th><th>Calls</th><th>Share</th></tr></thead>
            <tbody>
              {stats.costByModel.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{r.model ?? "unknown"}</td>
                  <td className="mono tnum">{fmtMoney(r.totalCostUsd)}</td>
                  <td className="mono tnum muted">{fmtNum(r.totalTokens)}</td>
                  <td className="mono tnum muted">{fmtNum(r.callCount)}</td>
                  <td className="mono tnum muted">{((r.totalCostUsd / totalCostShare) * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {stats.costByModel.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 16 }}>No data</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="hd"><h3>By agent</h3></div>
          <table className="tbl">
            <thead><tr><th>Agent</th><th>Cost</th><th>Traces</th><th>Tokens</th><th>Errors</th></tr></thead>
            <tbody>
              {stats.topAgents.map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{r.agentId}</td>
                  <td className="mono tnum">{fmtMoney(r.totalCostUsd)}</td>
                  <td className="mono tnum muted">{fmtNum(r.traceCount)}</td>
                  <td className="mono tnum muted">{fmtNum(r.totalTokens)}</td>
                  <td className="mono tnum" style={{ color: r.errorRate > 0.05 ? "var(--error)" : "var(--text-3)" }}>{(r.errorRate * 100).toFixed(1)}%</td>
                </tr>
              ))}
              {stats.topAgents.length === 0 && <tr><td colSpan={5} className="muted" style={{ textAlign: "center", padding: 16 }}>No data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="hd"><h3>Plan usage</h3></div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <MeterBar used={billing.tracesUsed} limit={billing.tracesLimit} tone={billingTone}/>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>
            <span>{fmtNum(billing.tracesUsed)} / {fmtNum(billing.tracesLimit)} traces</span>
            <span style={{ textTransform: "capitalize" }}>{billing.plan} plan · {(billing.usagePct * 100).toFixed(1)}% used</span>
          </div>
        </div>
      </div>
    </div>
  );
}
