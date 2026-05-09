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

  useEffect(() => {
    if (!project || !token) return;
    setFetching(true);
    const days = PERIOD_DAYS[period];
    const from = new Date(Date.now() - days * 86400_000).toISOString();
    const to = new Date().toISOString();

    Promise.all([
      apiGet<StatsResponse>(`/v1/projects/${project.id}/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, token),
      apiGet<{ plan: string; tracesUsed: number; tracesLimit: number; usagePct: number }>(`/v1/projects/${project.id}/billing`, token),
    ])
      .then(([s, b]) => { setStats(s); setBilling(b); })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [project, token, period]);

  if (projectLoading || fetching || !stats || !billing) {
    return (
      <div className="fade-up">
        <div className="page-h"><div><h1>Cost Explorer</h1><div className="sub">LLM spend breakdown by time, model, and agent.</div></div></div>
        <div className="card card-pad muted" style={{ textAlign: "center" }}>Loading…</div>
      </div>
    );
  }

  const series = stats.dailyStats.map(d => ({ date: d.date, costUsd: Number(d.totalCostUsd) }));
  const avgCostPerTrace = stats.totals.traceCount > 0 ? Number(stats.totals.totalCostUsd) / stats.totals.traceCount : 0;
  const modelTotal = stats.costByModel.reduce((s, m) => s + Number(m.totalCostUsd), 0);
  const agentTotal = stats.topAgents.reduce((s, a) => s + Number(a.totalCostUsd), 0);
  const usagePct = billing.usagePct;
  const billingTone = usagePct > 0.9 ? "err" : usagePct > 0.7 ? "warn" : "ok";
  const periodStart = new Date(Date.now() - PERIOD_DAYS[period] * 86400_000).toISOString().slice(0, 10);
  const periodEnd = new Date().toISOString().slice(0, 10);

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Cost Explorer</h1>
          <div className="sub">LLM spend breakdown by time, model, and agent.</div>
        </div>
        <div className="seg">
          {(["7d", "30d", "90d"] as Period[]).map(p => (
            <button key={p} data-active={period === p ? "true" : "false"} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap-card, 14px)", marginBottom: 14 }}>
        <div className="card stat">
          <div className="stat-label">Total spend</div>
          <div className="stat-value">{fmtMoney(stats.totals.totalCostUsd)}</div>
          <div className="mono muted-2" style={{ fontSize: 10.5 }}>{period} window</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Tokens used</div>
          <div className="stat-value">{fmtNum(stats.totals.totalTokens)}</div>
          <div className="mono muted-2" style={{ fontSize: 10.5 }}>all models</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Traces billed</div>
          <div className="stat-value">{fmtNum(stats.totals.traceCount)}</div>
          <div className="mono muted-2" style={{ fontSize: 10.5 }}>LLM steps only</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Avg / trace</div>
          <div className="stat-value">{fmtMoney(avgCostPerTrace)}</div>
          <div className="mono muted-2" style={{ fontSize: 10.5 }}>cost efficiency</div>
        </div>
      </div>

      {/* Daily chart + billing card */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "var(--gap-card, 14px)", marginBottom: 14 }}>
        <div className="card">
          <div className="hd"><h3>Daily spend</h3><span className="sub mono">{period} · USD</span></div>
          <div style={{ padding: "12px 18px 18px" }}>
            <BarChart series={series}/>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Plan usage</h3><span className="sub mono">{periodStart} – {periodEnd}</span></div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="col" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                <span className="muted-2">Traces this month</span>
                <span className="mono tnum">{fmtNum(billing.tracesUsed)} / {fmtNum(billing.tracesLimit)}</span>
              </div>
              <MeterBar used={billing.tracesUsed} limit={billing.tracesLimit} tone={billingTone}/>
              <div className="mono muted-2" style={{ fontSize: 10.5 }}>{(usagePct * 100).toFixed(1)}% of monthly quota</div>
            </div>
            <div className="hr"/>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontSize: 11.5 }}>
              <span className="muted-2">Plan</span>
              <span className="mono" style={{ textTransform: "capitalize" }}>{billing.plan}</span>
              <span className="muted-2">Period</span>
              <span className="mono">{periodStart}</span>
              <span className="muted-2">Resets</span>
              <span className="mono">{periodEnd}</span>
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }}>Upgrade plan</button>
          </div>
        </div>
      </div>

      {/* Model + Agent breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-card, 14px)" }}>
        <div className="card">
          <div className="hd"><h3>By model</h3><span className="sub mono">LLM cost attribution</span></div>
          <div>
            {stats.costByModel.filter(m => m.model).map((m, i) => {
              const cost = Number(m.totalCostUsd);
              const pct = modelTotal > 0 ? (cost / modelTotal) * 100 : 0;
              return (
                <div key={i} style={{ padding: "10px 16px", borderBottom: i < stats.costByModel.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{m.model}</span>
                    <span className="mono tnum" style={{ fontSize: 12 }}>{fmtMoney(cost)}</span>
                  </div>
                  <div className="bar" style={{ height: 4, marginBottom: 4 }}>
                    <div className="bar-fill" style={{ width: pct + "%", background: "var(--violet)" }}/>
                  </div>
                  <div className="row muted-2 mono" style={{ gap: 12, fontSize: 10.5 }}>
                    <span>{fmtNum(m.totalTokens)} tok</span>
                    <span>{fmtNum(m.callCount)} calls</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
            {stats.costByModel.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>No LLM calls yet.</div>}
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>By agent</h3><span className="sub mono">agent cost attribution</span></div>
          <div>
            {stats.topAgents.map((a, i) => {
              const cost = Number(a.totalCostUsd);
              const pct = agentTotal > 0 ? (cost / agentTotal) * 100 : 0;
              return (
                <div key={i} style={{ padding: "10px 16px", borderBottom: i < stats.topAgents.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{a.agentId}</span>
                    <span className="mono tnum" style={{ fontSize: 12 }}>{fmtMoney(cost)}</span>
                  </div>
                  <div className="bar" style={{ height: 4, marginBottom: 4 }}>
                    <div className="bar-fill" style={{ width: pct + "%", background: "var(--accent)" }}/>
                  </div>
                  <div className="row muted-2 mono" style={{ gap: 12, fontSize: 10.5 }}>
                    <span>{fmtNum(a.traceCount)} traces</span>
                    <span>{fmtNum(a.totalTokens)} tok</span>
                    <span style={{ color: (a.errorRate ?? 0) > 0.02 ? "var(--error)" : "var(--text-3)" }}>
                      {((a.errorRate ?? 0) * 100).toFixed(1)}% err
                    </span>
                  </div>
                </div>
              );
            })}
            {stats.topAgents.length === 0 && <div className="muted" style={{ padding: 24, textAlign: "center" }}>No traces yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
