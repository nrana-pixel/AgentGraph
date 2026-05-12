"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { fmtNum, fmtMs, fmtPct } from "@/lib/format";
import { Sparkline, StatusBadge } from "@/components/ui/primitives";
import { IconFilter, IconChev } from "@/components/ui/icons";
import { useBusEvent } from "@/lib/bus";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { GettingStartedCard } from "@/components/onboarding/GettingStartedCard";
import type { TraceRow } from "@agentgraph/types";

type DayStat = { date: string; traceCount: number; errorCount: number; totalTokens: number; totalCostUsd: number };
type TopAgent = { agentId: string; traceCount: number; errorRate: number };
type CostModel = { model: string | null; totalTokens: number; totalCostUsd: number; callCount: number };
type Totals = { traceCount: number; totalCostUsd: number; totalTokens: number; errorRate: number };
type StatsResp = { totals: Totals; dailyStats: DayStat[]; topAgents: TopAgent[]; costByModel: CostModel[] };

function StatCard({ label, value, sub, spark, color }: { label: string; value: string; sub?: string; spark?: number[]; color?: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="muted-2 mono" style={{ fontSize: 10.5 }}>{sub}</div>}
      {spark && <div className="stat-spark"><Sparkline values={spark} {...(color ? { color } : {})}/></div>}
    </div>
  );
}

function ActivityChart({ series, hoverIdx, setHoverIdx }: { series: DayStat[]; hoverIdx: number | null; setHoverIdx: (i: number | null) => void }) {
  const w = 800, h = 240, pad = { l: 40, r: 12, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  if (!series.length) {
    return <div className="muted" style={{ textAlign: "center", padding: 40 }}>No data for this period</div>;
  }

  const maxT = Math.max(...series.map(d => d.traceCount), 1);
  const maxE = Math.max(...series.map(d => d.errorCount), 1);
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;
  const path = series.map((d, i) => {
    const x = pad.l + i * stepX;
    const y = pad.t + innerH - (d.traceCount / maxT) * innerH;
    return (i === 0 ? "M" : "L") + x + "," + y;
  }).join(" ");
  const area = path + ` L${pad.l + innerW},${pad.t + innerH} L${pad.l},${pad.t + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 240 }} onMouseLeave={() => setHoverIdx(null)}>
      <defs>
        <linearGradient id="grad-traces" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3"/>
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <g className="chart-grid">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1={pad.l} x2={w - pad.r} y1={pad.t + innerH * p} y2={pad.t + innerH * p}/>
        ))}
      </g>
      <g className="chart-axis">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <text key={i} x={pad.l - 6} y={pad.t + innerH * (1 - p) + 3} textAnchor="end">{Math.round(maxT * p)}</text>
        ))}
        {series.map((d, i) => i % 2 === 0 ? <text key={i} x={pad.l + i * stepX} y={h - 8} textAnchor="middle">{d.date.slice(5)}</text> : null)}
      </g>
      {series.map((d, i) => {
        const x = pad.l + i * stepX;
        const eh = (d.errorCount / maxE) * 24;
        return <rect key={"e" + i} x={x - 2} y={pad.t + innerH - eh} width={4} height={eh} fill="var(--error)" opacity="0.5" rx="1"/>;
      })}
      <path d={area} fill="url(#grad-traces)"/>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
      {series.map((d, i) => {
        const x = pad.l + i * stepX;
        const y = pad.t + innerH - (d.traceCount / maxT) * innerH;
        return (
          <g key={i}>
            <rect x={x - stepX / 2} y={pad.t} width={stepX} height={innerH} fill="transparent" onMouseEnter={() => setHoverIdx(i)}/>
            {hoverIdx === i && <line x1={x} x2={x} y1={pad.t} y2={pad.t + innerH} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="3,3"/>}
            <circle cx={x} cy={y} r={hoverIdx === i ? 4 : 2.5} fill="var(--accent)" stroke="var(--bg)" strokeWidth="2"/>
          </g>
        );
      })}
      {hoverIdx != null && (() => {
        const d = series[hoverIdx];
        if (!d) return null;
        const x = pad.l + hoverIdx * stepX;
        return (
          <g transform={`translate(${Math.min(Math.max(x, pad.l + 60), w - pad.r - 60)},${pad.t + 10})`}>
            <rect x={-58} y={-4} width={116} height={56} rx="6" fill="var(--panel-hi)" stroke="var(--border-2)"/>
            <text x={0} y={12} textAnchor="middle" className="chart-axis" style={{ fill: "var(--text-2)", fontSize: 10 }}>{d.date}</text>
            <text x={-50} y={28} className="chart-axis" style={{ fill: "var(--accent)" }}>traces</text>
            <text x={50} y={28} textAnchor="end" className="chart-axis" style={{ fill: "var(--text)" }}>{d.traceCount}</text>
            <text x={-50} y={42} className="chart-axis" style={{ fill: "var(--error)" }}>errors</text>
            <text x={50} y={42} textAnchor="end" className="chart-axis" style={{ fill: "var(--text)" }}>{d.errorCount}</text>
          </g>
        );
      })()}
    </svg>
  );
}

export default function DashboardPage() {
  const { project, token, loading: projectLoading } = useProject();
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [liveOn, setLiveOn] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!project || !token) return;
    setStatsLoading(true);
    const from = new Date(Date.now() - 14 * 86400_000).toISOString();
    Promise.all([
      apiGet<StatsResp>(`/v1/projects/${project.id}/stats?from=${from}`, token),
      apiGet<{ traces: TraceRow[] }>(`/v1/traces?projectId=${project.id}&limit=6`, token),
    ])
      .then(([s, t]) => { setStats(s); setTraces(t.traces); })
      .catch((err: Error) => toast(`Failed to load dashboard: ${err.message}`))
      .finally(() => setStatsLoading(false));
  }, [project, token, toast]);

  useBusEvent("toggleLiveTail", useCallback(() => setLiveOn(o => !o), []));

  if (projectLoading || statsLoading) {
    return <div className="fade-up"><div className="page-h"><div><h1>Overview</h1></div></div><div className="card card-pad muted" style={{ textAlign: "center" }}>Loading…</div></div>;
  }

  if (!project || !token) {
    return <div className="fade-up"><div className="page-h"><div><h1>Overview</h1></div></div><div className="card card-pad muted" style={{ textAlign: "center" }}>No project found. <Link href="/settings">Create one in Settings</Link> to start ingesting traces.</div></div>;
  }

  if (!stats) {
    return <div className="fade-up"><div className="page-h"><div><h1>Overview</h1></div></div><div className="card card-pad muted" style={{ textAlign: "center" }}>Couldn’t load stats for this project. Check the API connection and refresh.</div></div>;
  }

  const { totals, dailyStats, topAgents, costByModel } = stats;
  const errorCount = Math.round((totals.errorRate ?? 0) * totals.traceCount);

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Overview</h1>
          <div className="sub">Live agent telemetry across all environments · last 14 days</div>
        </div>
        <div className="row">
          <button className={"btn " + (liveOn ? "live-tail-on" : "")} onClick={() => setLiveOn(o => !o)}>
            <span className={liveOn ? "pulse-dot" : ""} style={!liveOn ? { width: 7, height: 7, borderRadius: 50, background: "var(--text-3)", display: "inline-block" } : {}}/> {liveOn ? "Live tail" : "Paused"}
          </button>
          <div className="seg">
            <button data-active="false">24h</button>
            <button data-active="true">14d</button>
            <button data-active="false">30d</button>
            <button data-active="false">90d</button>
          </div>
          <button className="btn"><IconFilter/> Filters</button>
          <button className="btn btn-primary">Export</button>
        </div>
      </div>

      {totals.traceCount === 0 && <GettingStartedCard/>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap-card, 14px)" }}>
        <StatCard label="Traces" value={fmtNum(totals.traceCount)} spark={dailyStats.map(d => d.traceCount)} color="var(--accent)" sub="this period"/>
        <StatCard label="Tokens" value={fmtNum(totals.totalTokens)} spark={dailyStats.map(d => d.totalTokens)} color="var(--violet)" sub="across all agents"/>
        <StatCard label="Cost" value={"$" + totals.totalCostUsd.toFixed(2)} spark={dailyStats.map(d => d.totalCostUsd)} color="var(--info)" sub="USD, all envs"/>
        <StatCard label="Errors" value={String(errorCount)} spark={dailyStats.map(d => d.errorCount)} color="var(--error)" sub={fmtPct(String(totals.errorRate ?? 0)) + " error rate"}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "var(--gap-card, 14px)", marginTop: 14 }}>
        <div className="card">
          <div className="hd">
            <h3>Activity</h3>
            <span className="sub">traces · errors · last 14 days</span>
            <div className="spacer"/>
            <div className="seg">
              <button data-active="true">stacked</button>
              <button data-active="false">overlay</button>
            </div>
          </div>
          <div style={{ padding: "16px 20px 22px" }}>
            <ActivityChart series={dailyStats} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}/>
          </div>
        </div>
        <div className="card">
          <div className="hd">
            <h3>Top agents</h3>
            <div className="spacer"/>
            <span className="sub mono">{topAgents.length}</span>
          </div>
          <div style={{ padding: "8px 14px 14px" }}>
            {topAgents.length === 0 && <div className="muted" style={{ textAlign: "center", padding: 20, fontSize: 12 }}>No traces yet</div>}
            {topAgents.map(a => {
              const pct = (a.traceCount / (topAgents[0]?.traceCount || 1)) * 100;
              return (
                <div key={a.agentId} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "8px 6px", gap: 12, alignItems: "center", borderBottom: "1px solid var(--border)" }}>
                  <div className="col" style={{ gap: 4 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="mono" style={{ fontSize: 12 }}>{a.agentId}</span>
                      <span className="mono muted" style={{ fontSize: 11 }}>{a.traceCount}</span>
                    </div>
                    <div className="bar bar-mini"><div className="bar-fill" style={{ width: pct + "%" }}/></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-card, 14px)", marginTop: 14 }}>
        <div className="card">
          <div className="hd">
            <h3>Top models</h3>
          </div>
          <table className="tbl">
            <thead><tr><th>Model</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr></thead>
            <tbody>
              {costByModel.filter(m => m.model).map(m => (
                <tr key={m.model}>
                  <td><span style={{ fontWeight: 500 }}>{m.model}</span></td>
                  <td className="mono tnum">{fmtNum(m.callCount)}</td>
                  <td className="mono tnum muted">{fmtNum(m.totalTokens)}</td>
                  <td className="mono tnum">${m.totalCostUsd.toFixed(3)}</td>
                </tr>
              ))}
              {costByModel.filter(m => m.model).length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center" }}>No LLM calls yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="hd">
            <h3>Recent traces</h3>
            <div className="spacer"/>
            <Link href="/traces" className="btn btn-ghost btn-sm">View all <IconChev/></Link>
          </div>
          <table className="tbl">
            <thead><tr><th>Trace</th><th>Agent</th><th>Status</th><th>Latency</th></tr></thead>
            <tbody>
              {traces.map(t => (
                <tr key={t.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{t.id.slice(0, 8)}…</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{t.agentId}</td>
                  <td><StatusBadge status={t.status}/></td>
                  <td className="mono tnum muted">{fmtMs(t.totalLatencyMs ?? undefined)}</td>
                </tr>
              ))}
              {traces.length === 0 && (
                <tr><td colSpan={4} className="muted" style={{ textAlign: "center" }}>No traces yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
