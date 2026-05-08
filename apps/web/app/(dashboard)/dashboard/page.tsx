"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { STATS, TOOLS_DATA, TRACES_DATA } from "@/lib/data";
import { fmtNum, fmtMs, fmtPct, fmtMoney, relTime } from "@/lib/format";
import { Sparkline, ToolIcon, StatusBadge, EnvBadge } from "@/components/ui/primitives";
import { IconFilter, IconChev, IconExt } from "@/components/ui/icons";
import { useBusEvent } from "@/lib/bus";

function StatCard({ label, value, sub, spark, color, delta }: { label: string; value: string; sub?: string; spark?: number[]; color?: string; delta?: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="row" style={{ alignItems: "baseline", gap: 8 }}>
        <div className="stat-value">{value}</div>
        {delta && <div className="stat-delta" style={{ color: delta.startsWith("-") ? "var(--error)" : "var(--success)" }}><span>{delta.startsWith("-") ? "↓" : "↑"}</span>{delta.replace(/^[-+]/, "")}</div>}
      </div>
      {sub && <div className="muted-2 mono" style={{ fontSize: 10.5 }}>{sub}</div>}
      {spark && <div className="stat-spark"><Sparkline values={spark} color={color}/></div>}
    </div>
  );
}

function ActivityChart({ series, hoverIdx, setHoverIdx }: { series: typeof STATS.dailySeries; hoverIdx: number | null; setHoverIdx: (i: number | null) => void }) {
  const w = 800, h = 240, pad = { l: 40, r: 12, t: 16, b: 28 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const maxT = Math.max(...series.map(d => d.traces));
  const stepX = innerW / (series.length - 1);
  const path = series.map((d, i) => {
    const x = pad.l + i * stepX;
    const y = pad.t + innerH - (d.traces / maxT) * innerH;
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
        const eh = (d.errors / 14) * 24;
        return <rect key={"e" + i} x={x - 2} y={pad.t + innerH - eh} width={4} height={eh} fill="var(--error)" opacity="0.5" rx="1"/>;
      })}
      <path d={area} fill="url(#grad-traces)"/>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.8" vectorEffect="non-scaling-stroke"/>
      {series.map((d, i) => {
        const x = pad.l + i * stepX;
        const y = pad.t + innerH - (d.traces / maxT) * innerH;
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
        const x = pad.l + hoverIdx * stepX;
        return (
          <g transform={`translate(${Math.min(Math.max(x, pad.l + 60), w - pad.r - 60)},${pad.t + 10})`}>
            <rect x={-58} y={-4} width={116} height={56} rx="6" fill="var(--panel-hi)" stroke="var(--border-2)"/>
            <text x={0} y={12} textAnchor="middle" className="chart-axis" style={{ fill: "var(--text-2)", fontSize: 10 }}>{d.date}</text>
            <text x={-50} y={28} className="chart-axis" style={{ fill: "var(--accent)" }}>traces</text>
            <text x={50} y={28} textAnchor="end" className="chart-axis" style={{ fill: "var(--text)" }}>{d.traces}</text>
            <text x={-50} y={42} className="chart-axis" style={{ fill: "var(--error)" }}>errors</text>
            <text x={50} y={42} textAnchor="end" className="chart-axis" style={{ fill: "var(--text)" }}>{d.errors}</text>
          </g>
        );
      })()}
    </svg>
  );
}

export default function DashboardPage() {
  const stats = STATS;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [liveOn, setLiveOn] = useState(true);

  useEffect(() => {
    if (!liveOn) return;
    const id = setInterval(() => setTick(t => t + 1), 2200);
    return () => clearInterval(id);
  }, [liveOn]);

  useBusEvent("toggleLiveTail", useCallback(() => setLiveOn(o => !o), []));

  const liveTraces = stats.totals.traces + Math.floor(tick * 1.4);
  const series = stats.dailySeries;

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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap-card, 14px)" }}>
        <StatCard label="Traces" value={fmtNum(liveTraces)} delta="+12.4%" spark={series.map(d => d.traces)} color="var(--accent)" sub={`${stats.totals.traces} this period`}/>
        <StatCard label="Tokens" value={fmtNum(stats.totals.tokens)} delta="+18.2%" spark={series.map(d => d.tokens)} color="var(--violet)" sub="across 7 agents"/>
        <StatCard label="Cost" value={"$" + parseFloat(stats.totals.costUsd).toFixed(2)} delta="+8.1%" spark={series.map(d => d.tokens / 1000)} color="var(--info)" sub="USD, all envs"/>
        <StatCard label="Errors" value={String(stats.totals.errors)} delta="-3.2%" spark={series.map(d => d.errors)} color="var(--error)" sub={fmtPct((stats.totals.errors / stats.totals.traces).toString()) + " error rate"}/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "var(--gap-card, 14px)", marginTop: 14 }}>
        <div className="card">
          <div className="hd">
            <h3>Activity</h3>
            <span className="sub">traces · tokens · errors</span>
            <div className="spacer"/>
            <div className="seg">
              <button data-active="true">stacked</button>
              <button data-active="false">overlay</button>
            </div>
          </div>
          <div style={{ padding: "16px 20px 22px" }}>
            <ActivityChart series={series} hoverIdx={hoverIdx} setHoverIdx={setHoverIdx}/>
          </div>
        </div>
        <div className="card">
          <div className="hd">
            <h3>Top agents</h3>
            <div className="spacer"/>
            <span className="sub mono">{stats.topAgents.length}</span>
          </div>
          <div style={{ padding: "8px 14px 14px" }}>
            {stats.topAgents.map(a => {
              const pct = (a.count / stats.topAgents[0].count) * 100;
              return (
                <div key={a.agentId} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "8px 6px", gap: 12, alignItems: "center", borderBottom: "1px solid var(--border)" }}>
                  <div className="col" style={{ gap: 4 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="mono" style={{ fontSize: 12 }}>{a.agentId}</span>
                      <span className="mono muted" style={{ fontSize: 11 }}>{a.count}</span>
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
            <h3>Top tools</h3>
            <div className="spacer"/>
            <Link href="/tools" className="btn btn-ghost btn-sm">View all <IconChev/></Link>
          </div>
          <table className="tbl">
            <thead><tr><th>Tool</th><th>Calls</th><th>Avg</th><th>Success</th></tr></thead>
            <tbody>
              {stats.topTools.map(t => {
                const tool = TOOLS_DATA.find(x => x.slug === t.toolName);
                return (
                  <tr key={t.toolName}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <ToolIcon size={24} slug={t.toolName} name={tool?.name ?? t.toolName}/>
                        <span style={{ fontWeight: 500 }}>{tool?.name ?? t.toolName}</span>
                        <span className="mono muted-2" style={{ fontSize: 10.5 }}>{tool?.category}</span>
                      </div>
                    </td>
                    <td className="mono tnum">{t.count}</td>
                    <td className="mono tnum muted">{fmtMs(parseInt(tool?.avgLatencyMs ?? "0"))}</td>
                    <td>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="mono tnum" style={{ minWidth: 56 }}>{fmtPct(tool?.successRate)}</span>
                        <div className="bar bar-mini" style={{ width: 60 }}>
                          <div className="bar-fill" style={{ width: (parseFloat(tool?.successRate ?? "0") * 100) + "%", background: "var(--success)" }}/>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
              {TRACES_DATA.slice(0, 6).map(t => (
                <tr key={t.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{t.id}</td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{t.agentId}</td>
                  <td><StatusBadge status={t.status}/></td>
                  <td className="mono tnum muted">{fmtMs(t.totalLatencyMs ?? undefined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
