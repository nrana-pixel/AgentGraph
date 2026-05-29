"use client";
import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ToolCategorySchema } from "@agentgraph/types";
import type { ToolRecommendation } from "@agentgraph/types";
import { fmtMs, fmtPct } from "@/lib/format";
import { Badge, ToolIcon, Ring } from "@/components/ui/primitives";
import { IconZap, IconChev, IconCheck, IconPlus } from "@/components/ui/icons";
import { useTweaks } from "@/lib/tweaks";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import TraceSwapInsights from "./TraceSwapInsights";

type Rec = ToolRecommendation & { isCold: boolean };

function DimMini({ label, value, valueLabel, color }: { label: string; value: number; valueLabel: string; color: string }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="mono muted-2" style={{ fontSize: 10 }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 11 }}>{valueLabel}</span>
      </div>
      <div className="bar bar-mini"><div className="bar-fill" style={{ width: value + "%", background: color }}/></div>
    </div>
  );
}

function RankedRec({ rec, rank, compared, onCompare }: { rec: Rec; rank: number; compared: boolean; onCompare: () => void }) {
  const [open, setOpen] = useState(rank === 1);
  const router = useRouter();
  const successRate = rec.successRate ?? 0;
  const avgLatencyMs = rec.avgLatencyMs ?? 0;
  const p95LatencyMs = rec.p95LatencyMs ?? 0;
  // popularity and sentiment are stored on a 0–100 scale
  const popularity100 = rec.popularityScore ?? 0;
  const sentiment100 = rec.sentimentScore ?? 0;
  return (
    <div className="rec-card fade-up" data-compared={compared ? "true" : undefined}>
      <div className="rec-score-wrap">
        <div className="rec-rank">#{rank}</div>
        <div style={{ position: "relative", width: 64, height: 64 }}>
          <Ring value={rec.isCold ? 0 : rec.score} size={64} stroke={5}/>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {rec.isCold
              ? <span className="mono muted-2" style={{ fontSize: 18 }}>—</span>
              : <span className="mono tnum" style={{ fontSize: 17, fontWeight: 600 }}>{Math.round(rec.score)}</span>}
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 8, flex: 1 }}>
        <div className="row" style={{ gap: 10 }}>
          <ToolIcon slug={rec.slug} name={rec.name} size={28} website={rec.website ?? null}/>
          <h3 style={{ margin: 0, fontSize: 15 }}>{rec.name}</h3>
          <Badge>{rec.category.replace("_", " ")}</Badge>
          {rec.isOpenSource && <Badge tone="ok">oss</Badge>}
          {rec.isCold ? <Badge>no telemetry</Badge> : <Badge tone="ok"><span className="dot"/>live</Badge>}
          <div className="spacer"/>
          <button className={"btn btn-sm " + (compared ? "btn-primary" : "")} onClick={e => { e.stopPropagation(); onCompare(); }}>
            {compared ? <><IconCheck/> Compare</> : "+ Compare"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 180ms" }}><IconChev/></button>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{rec.reason}</div>
        {rec.isCold ? (
          <div className="muted-2 mono" style={{ fontSize: 10.5, padding: "8px 0", letterSpacing: "0.03em" }}>
            no telemetry — reliability, latency, popularity, and sentiment appear after first trace
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, paddingTop: 4 }}>
            <DimMini label="reliability" value={successRate * 100} valueLabel={fmtPct(String(successRate))} color="var(--success)"/>
            <DimMini label="latency" value={Math.max(0, 1 - avgLatencyMs / 2000) * 100} valueLabel={fmtMs(avgLatencyMs)} color="var(--accent)"/>
            <DimMini label="popularity" value={popularity100} valueLabel={popularity100.toFixed(0)} color="var(--violet)"/>
            <DimMini label="sentiment" value={sentiment100} valueLabel={(sentiment100 / 20).toFixed(1) + "★"} color="var(--info)"/>
          </div>
        )}
        {open && (
          <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <div className="col" style={{ gap: 6, fontSize: 11.5 }}>
              <div className="row" style={{ gap: 14 }}>
                {!rec.isCold && <><span className="muted-2 mono">p95</span><span className="mono">{fmtMs(p95LatencyMs)}</span></>}
                <span className="muted-2 mono">pricing</span><span className="mono">{rec.pricingModel || "—"}</span>
                <span className="muted-2 mono">residency</span><span className="mono">{(rec.dataResidency ?? []).join(" · ") || "—"}</span>
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={() => router.push("/tools/" + rec.slug)}>Profile <IconChev/></button>
              {rec.docsUrl && <a href={rec.docsUrl} target="_blank" rel="noopener" className="btn btn-sm">Docs</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CompactRec({ rec, rank, compared, onCompare }: { rec: Rec; rank: number; compared: boolean; onCompare: () => void }) {
  const router = useRouter();
  const successRate = rec.successRate ?? 0;
  const avgLatencyMs = rec.avgLatencyMs ?? 0;
  const sentiment100 = rec.sentimentScore ?? 0;
  return (
    <div className="card card-pad fade-up" data-compared={compared ? "true" : undefined} style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
      <button className="compact-compare" data-active={compared ? "true" : undefined} onClick={e => { e.stopPropagation(); onCompare(); }} title="Compare">
        {compared ? <IconCheck/> : <IconPlus/>}
      </button>
      <div onClick={() => router.push("/tools/" + rec.slug)} style={{ display: "contents", cursor: "default" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="mono muted-2" style={{ fontSize: 10.5 }}>#{rank}</span>
          {rec.isCold
            ? <span className="mono muted-2" style={{ fontSize: 11 }}>no telemetry</span>
            : <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{Math.round(rec.score)}<span className="muted-2" style={{ fontSize: 10 }}>/100</span></span>}
        </div>
        <div className="row" style={{ gap: 10 }}>
          <ToolIcon slug={rec.slug} name={rec.name} size={28} website={rec.website ?? null}/>
          <div className="col" style={{ gap: 0 }}>
            <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{rec.name}</h4>
            <span className="mono muted-2" style={{ fontSize: 10.5 }}>{rec.category.replace("_", " ")}</span>
          </div>
        </div>
        {!rec.isCold && (
          <>
            <div className="bar"><div className="bar-fill" style={{ width: rec.score + "%" }}/></div>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
              <span>{fmtPct(String(successRate))}</span>
              <span>{fmtMs(avgLatencyMs)}</span>
              <span>{(sentiment100 / 20).toFixed(1)}★</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GalaxyRec({ recs }: { recs: Rec[] }) {
  const router = useRouter();
  return (
    <div className="rec-galaxy">
      {[30, 60, 90].map(r => (
        <div key={r} style={{ position: "absolute", left: "50%", top: "50%", width: r * 2 + "%", height: r * 2 + "%", border: "1px dashed var(--border)", borderRadius: "50%", transform: "translate(-50%, -50%)" }}/>
      ))}
      <div className="mono muted-2" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", fontSize: 10.5, padding: "4px 10px", border: "1px solid var(--border-2)", background: "var(--bg)", borderRadius: 16 }}>task</div>
      {recs.map((r, i) => {
        const angle = (i / recs.length) * Math.PI * 2 - Math.PI / 2;
        // Cold tools have no real score → pin them to the outer ring so radius isn't misleading
        const radius = r.isCold ? 42 : 12 + (1 - r.score / 100) * 32;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        return (
          <div key={r.slug} className="rec-node" data-selected={i === 0 ? "true" : undefined} style={{ left: x + "%", top: y + "%" }} onClick={() => router.push("/tools/" + r.slug)}>
            <div className="row" style={{ gap: 6 }}>
              <ToolIcon slug={r.slug} name={r.name} size={20} website={r.website ?? null}/>
              <span className="rec-node-name">{r.name}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              {r.isCold
                ? <span className="rec-node-score muted-2">no data</span>
                : <span className="rec-node-score">★ {Math.round(r.score)}</span>}
              <span className="mono muted-2" style={{ fontSize: 10 }}>#{i + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RecommendationsPage() {
  const [tweaks] = useTweaks();
  const { token } = useProject();
  const [task, setTask] = useState("Send transactional emails to verified users with low p95 latency");
  const [cat, setCat] = useState<string>("");
  const [oss, setOss] = useState(false);
  const [selfHosted, setSelfHosted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [style, setStyle] = useState<"ranked" | "compact" | "galaxy">(tweaks.recCard as "ranked" | "compact" | "galaxy");
  const [recs, setRecs] = useState<Rec[]>([]);
  const [compareItems, setCompareItems] = useState<Rec[]>([]);
  const toast = useToast();

  useEffect(() => { setStyle(tweaks.recCard as "ranked" | "compact" | "galaxy"); }, [tweaks.recCard]);

  const toggleCompare = (rec: Rec) => {
    setCompareItems(prev => {
      if (prev.find(x => x.slug === rec.slug)) return prev.filter(x => x.slug !== rec.slug);
      if (prev.length >= 3) return [...prev.slice(1, 3).filter((x): x is Rec => !!x), rec];
      return [...prev, rec];
    });
  };

  const submit = () => {
    if (!task.trim() || !token) return;
    const params = new URLSearchParams({ task: task.trim(), limit: "5" });
    if (cat) params.set("category", cat);
    if (oss) params.set("openSource", "true");
    if (selfHosted) params.set("selfHosted", "true");
    setLoading(true);
    apiGet<{ recommendations: ToolRecommendation[] }>(`/v1/tools/recommend?${params}`, token)
      .then(d => setRecs(d.recommendations.map(r => ({ ...r, isCold: r.dataSource === "seeded" }))))
      .catch((err: Error) => toast(`Failed to fetch recommendations: ${err.message}`))
      .finally(() => setLoading(false));
  };

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Recommend</h1>
          <div className="sub">Describe the task; we'll rank tools by reliability, latency, popularity, and sentiment.</div>
        </div>
        <div className="seg">
          <button data-active={style === "ranked" ? "true" : "false"} onClick={() => setStyle("ranked")}>Ranked</button>
          <button data-active={style === "compact" ? "true" : "false"} onClick={() => setStyle("compact")}>Compact</button>
          <button data-active={style === "galaxy" ? "true" : "false"} onClick={() => setStyle("galaxy")}>Galaxy</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ padding: 14 }}>
          <label className="mono muted-2" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>Task</label>
          <div className="row" style={{ alignItems: "stretch", gap: 8, marginTop: 6 }}>
            <textarea className="input grow" rows={2} value={task} onChange={e => setTask(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
                      placeholder="e.g. Store user-uploaded PDFs with EU residency, low cost, no egress fees"
                      style={{ resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12.5, lineHeight: 1.5 }}/>
            <button className="btn btn-primary" onClick={submit} disabled={loading} style={{ alignSelf: "stretch", padding: "0 16px" }}>
              {loading ? <span className="spinner"/> : <IconZap/>}
              {loading ? "Ranking..." : "Recommend"}
            </button>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <select className="select" value={cat} onChange={e => setCat(e.target.value)}>
              <option value="">auto-detect category</option>
              {ToolCategorySchema.options.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
            </select>
            <label className="row" style={{ gap: 6, fontSize: 12 }}><input type="checkbox" checked={oss} onChange={e => setOss(e.target.checked)}/> Open source</label>
            <label className="row" style={{ gap: 6, fontSize: 12 }}><input type="checkbox" checked={selfHosted} onChange={e => setSelfHosted(e.target.checked)}/> Self-hosted</label>
            <div className="spacer"/>
            <span className="mono muted-2" style={{ fontSize: 10.5 }}>data freshness · {new Date().toISOString().slice(0, 10)}</span>
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 10, padding: "0 4px 12px", flexWrap: "wrap" }}>
        <span className="mono muted-2" style={{ fontSize: 10.5 }}>SCORE =</span>
        <span className="badge" style={{ borderColor: "color-mix(in srgb, var(--success) 38%, transparent)", color: "var(--success)" }}>success × 40%</span>
        <span className="muted-2 mono">+</span>
        <span className="badge" style={{ borderColor: "color-mix(in srgb, var(--accent) 38%, transparent)", color: "var(--accent)" }}>latency × 20%</span>
        <span className="muted-2 mono">+</span>
        <span className="badge" style={{ borderColor: "color-mix(in srgb, var(--violet) 38%, transparent)", color: "var(--violet)" }}>popularity × 25%</span>
        <span className="muted-2 mono">+</span>
        <span className="badge" style={{ borderColor: "color-mix(in srgb, var(--info) 38%, transparent)", color: "var(--info)" }}>sentiment × 15%</span>
      </div>

      {recs.length > 0 && recs.every(r => r.isCold) && (
        <div className="card card-pad fade-up" style={{ marginBottom: 10, borderColor: "color-mix(in srgb, var(--info) 32%, transparent)", background: "color-mix(in srgb, var(--info) 6%, var(--panel))" }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            <strong>No real telemetry on any of these tools yet.</strong>{" "}
            Results are ordered by how well their name and description match your task — not by performance.
            Reliability, latency, popularity, and sentiment scores will appear here once your project has accumulated traces that call these tools.
          </div>
        </div>
      )}

      {recs.length === 0 ? (
        <div className="card card-pad muted" style={{ textAlign: "center" }}>
          {loading ? "Ranking tools…" : "Enter a task above and click Recommend."}
        </div>
      ) : style === "ranked" ? (
        <div className="col" style={{ gap: 10 }}>
          {recs.map((r, i) => <RankedRec key={r.slug} rec={r} rank={i + 1} compared={!!compareItems.find(x => x.slug === r.slug)} onCompare={() => toggleCompare(r)}/>)}
        </div>
      ) : style === "compact" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {recs.map((r, i) => <CompactRec key={r.slug} rec={r} rank={i + 1} compared={!!compareItems.find(x => x.slug === r.slug)} onCompare={() => toggleCompare(r)}/>)}
        </div>
      ) : (
        <GalaxyRec recs={recs}/>
      )}

      {compareItems.length > 0 && (
        <div className="compare-drawer" data-open="true">
          <div className="compare-tab" onClick={() => setCompareItems([])}>
            <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em" }}>COMPARE · {compareItems.length}</span>
            <IconChev/>
          </div>
          <div className="compare-body">
            <div className="compare-head">
              <span className="mono muted-2" style={{ fontSize: 10.5 }}>SIDE-BY-SIDE</span>
              <div className="spacer"/>
              <button className="btn btn-ghost btn-sm" onClick={() => setCompareItems([])}>Clear</button>
            </div>
            <div className="compare-grid" style={{ gridTemplateColumns: "150px " + compareItems.map(() => "1fr").join(" ") }}>
              <div/>
              {compareItems.map(r => (
                <div key={r.slug} className="compare-tool-cell">
                  <div className="row" style={{ gap: 8 }}>
                    <ToolIcon slug={r.slug} name={r.name} size={22}/>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
                  </div>
                  <div className="mono muted-2" style={{ fontSize: 10.5 }}>{r.category.replace("_", " ")}</div>
                </div>
              ))}
              {[
                { key: "score", label: "Score", fmt: (v: number) => Math.round(v), max: 100, color: "var(--accent)" },
                { key: "successRate", label: "Reliability", fmt: (v: number) => (v * 100).toFixed(2) + "%", max: 1, color: "var(--success)" },
                { key: "avgLatencyMs", label: "Avg latency", fmt: (v: number) => v + "ms", inverted: true, max: 2000, color: "var(--accent)" },
              ].map(d => {
                // Only compare across live tools — cold tools have no real value for this metric
                const liveItems = compareItems.filter(r => !r.isCold);
                const vals = liveItems.map(r => ((r as unknown as Record<string, number>)[d.key]) ?? 0);
                const winner = d.inverted ? Math.min(...vals) : Math.max(...vals);
                return (
                  <React.Fragment key={d.key}>
                    <div className="compare-row-label">{d.label}</div>
                    {compareItems.map(r => {
                      if (r.isCold) {
                        return (
                          <div key={r.slug} className="compare-cell">
                            <span className="mono muted-2" style={{ fontSize: 11 }}>no telemetry</span>
                          </div>
                        );
                      }
                      const v = ((r as unknown as Record<string, number>)[d.key]) ?? 0;
                      const isWinner = vals.length > 1 && v === winner;
                      const pct = d.inverted ? Math.max(8, 100 - (v / d.max) * 100) : (v / d.max) * 100;
                      return (
                        <div key={r.slug} className="compare-cell" data-winner={isWinner ? "true" : undefined}>
                          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                            <span className="mono tnum" style={{ fontSize: 12, fontWeight: isWinner ? 600 : 400 }}>{d.fmt(v)}</span>
                            {isWinner && <span className="mono" style={{ fontSize: 9.5, color: d.color, fontWeight: 600 }}>BEST</span>}
                          </div>
                          <div className="bar bar-mini"><div className="bar-fill" style={{ width: Math.max(2, Math.min(100, pct)) + "%", background: isWinner ? d.color : "var(--text-3)" }}/></div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <TraceSwapInsights />
    </div>
  );
}
