"use client";
import { useState, useMemo } from "react";
import { COST_DATA_7D, COST_DATA_30D, COST_DATA_90D, BILLING } from "@/lib/data";
import { fmtMoney, fmtNum } from "@/lib/format";

type Period = "7d" | "30d" | "90d";

const PERIOD_DATA = { "7d": COST_DATA_7D, "30d": COST_DATA_30D, "90d": COST_DATA_90D };

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

export default function CostExplorerPage() {
  const [period, setPeriod] = useState<Period>("30d");
  const data = PERIOD_DATA[period];

  const usagePct = BILLING.tracesUsed / BILLING.tracesLimit;
  const billingTone = usagePct > 0.9 ? "err" : usagePct > 0.7 ? "warn" : "ok";

  const avgCostPerTrace = data.totals.traces > 0
    ? data.totals.costUsd / data.totals.traces
    : 0;

  const topModel = data.byModel[0];
  const modelTotal = data.byModel.reduce((s, m) => s + m.costUsd, 0);
  const agentTotal = data.byAgent.reduce((s, a) => s + a.costUsd, 0);

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
          <div className="stat-value">{fmtMoney(data.totals.costUsd)}</div>
          <div className="mono muted-2" style={{ fontSize: 10.5 }}>{period} window</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Tokens used</div>
          <div className="stat-value">{fmtNum(data.totals.tokens)}</div>
          <div className="mono muted-2" style={{ fontSize: 10.5 }}>all models</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Traces billed</div>
          <div className="stat-value">{fmtNum(data.totals.traces)}</div>
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
            <BarChart series={data.series}/>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Plan usage</h3><span className="sub mono">{BILLING.periodStart} – {BILLING.periodEnd}</span></div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="col" style={{ gap: 6 }}>
              <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                <span className="muted-2">Traces this month</span>
                <span className="mono tnum">{fmtNum(BILLING.tracesUsed)} / {fmtNum(BILLING.tracesLimit)}</span>
              </div>
              <MeterBar used={BILLING.tracesUsed} limit={BILLING.tracesLimit} tone={billingTone}/>
              <div className="mono muted-2" style={{ fontSize: 10.5 }}>{(usagePct * 100).toFixed(1)}% of monthly quota</div>
            </div>
            <div className="hr"/>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontSize: 11.5 }}>
              <span className="muted-2">Plan</span>
              <span className="mono" style={{ textTransform: "capitalize" }}>{BILLING.plan}</span>
              <span className="muted-2">Period</span>
              <span className="mono">{BILLING.periodStart}</span>
              <span className="muted-2">Resets</span>
              <span className="mono">{BILLING.periodEnd}</span>
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
            {data.byModel.map((m, i) => {
              const pct = modelTotal > 0 ? (m.costUsd / modelTotal) * 100 : 0;
              return (
                <div key={i} style={{ padding: "10px 16px", borderBottom: i < data.byModel.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{m.model}</span>
                    <span className="mono tnum" style={{ fontSize: 12 }}>{fmtMoney(m.costUsd)}</span>
                  </div>
                  <div className="bar" style={{ height: 4, marginBottom: 4 }}>
                    <div className="bar-fill" style={{ width: pct + "%", background: "var(--violet)" }}/>
                  </div>
                  <div className="row muted-2 mono" style={{ gap: 12, fontSize: 10.5 }}>
                    <span>{fmtNum(m.tokens)} tok</span>
                    <span>{fmtNum(m.calls)} calls</span>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>By agent</h3><span className="sub mono">agent cost attribution</span></div>
          <div>
            {data.byAgent.map((a, i) => {
              const pct = agentTotal > 0 ? (a.costUsd / agentTotal) * 100 : 0;
              return (
                <div key={i} style={{ padding: "10px 16px", borderBottom: i < data.byAgent.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
                    <span className="mono" style={{ fontSize: 12.5, fontWeight: 500 }}>{a.agentId}</span>
                    <span className="mono tnum" style={{ fontSize: 12 }}>{fmtMoney(a.costUsd)}</span>
                  </div>
                  <div className="bar" style={{ height: 4, marginBottom: 4 }}>
                    <div className="bar-fill" style={{ width: pct + "%", background: "var(--accent)" }}/>
                  </div>
                  <div className="row muted-2 mono" style={{ gap: 12, fontSize: 10.5 }}>
                    <span>{fmtNum(a.traces)} traces</span>
                    <span>{fmtNum(a.tokens)} tok</span>
                    <span style={{ color: a.errorRate > 0.02 ? "var(--error)" : "var(--text-3)" }}>
                      {(a.errorRate * 100).toFixed(1)}% err
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
