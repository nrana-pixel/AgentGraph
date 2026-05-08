"use client";
import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TOOLS_DATA, TOOL_CATEGORIES } from "@/lib/data";
import { fmtMs, fmtPct } from "@/lib/format";
import { Badge, ToolIcon, Ring } from "@/components/ui/primitives";
import { IconZap, IconChev, IconCheck, IconPlus } from "@/components/ui/icons";
import { useTweaks } from "@/lib/tweaks";

type Rec = {
  slug: string; name: string; category: string; score: number;
  successRate: number; avgLatencyMs: number; p95LatencyMs: number;
  popularityScore: number; sentimentScore: number; isOpenSource: boolean;
  isSelfHostable: boolean; pricingModel: string; dataResidency: string[];
  reason: string; isCold: boolean; docsUrl: string;
};

const HINTS: Record<string, RegExp> = {
  email: /email|transactional|inbox|smtp/i,
  auth: /auth|sign[- ]?in|login|sso|user/i,
  payments: /pay|stripe|checkout|invoice|charge/i,
  vector_db: /vector|embedding|rag|semantic/i,
  database: /database|postgres|sql|store/i,
  storage: /storage|file|upload|blob|s3/i,
  search: /search|index|query/i,
  monitoring: /monitor|trace|error|observ|metric/i,
  llm_provider: /llm|inference|model|gpt|claude/i,
  ai_gateway: /gateway|fallback|cache/i,
  analytics: /analytics|funnel|event/i,
  crm: /crm|lead|contact/i,
  queue: /queue|job|background|worker/i,
  communication: /slack|sms|notify|message/i,
};

function buildReason(t: typeof TOOLS_DATA[0], success: number, latency: number, popularity: number, sentiment: number) {
  const top = [["high reliability", success], ["low latency", latency], ["broad adoption", popularity], ["positive sentiment", sentiment]]
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
  return `${t.name} ranked highest for "${t.category.replace("_", " ")}" — ${top}, ${fmtPct(t.successRate)} success, ${t.avgLatencyMs}ms p50.`;
}

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
  return (
    <div className="rec-card fade-up" data-compared={compared ? "true" : undefined}>
      <div className="rec-score-wrap">
        <div className="rec-rank">#{rank}</div>
        <div style={{ position: "relative", width: 64, height: 64 }}>
          <Ring value={rec.score} size={64} stroke={5}/>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span className="mono tnum" style={{ fontSize: 17, fontWeight: 600 }}>{Math.round(rec.score)}</span>
          </div>
        </div>
      </div>
      <div className="col" style={{ gap: 8, flex: 1 }}>
        <div className="row" style={{ gap: 10 }}>
          <ToolIcon slug={rec.slug} name={rec.name} size={28}/>
          <h3 style={{ margin: 0, fontSize: 15 }}>{rec.name}</h3>
          <Badge>{rec.category.replace("_", " ")}</Badge>
          {rec.isOpenSource && <Badge tone="ok">oss</Badge>}
          {rec.isCold ? <Badge tone="info">est.</Badge> : <Badge tone="ok"><span className="dot"/>live</Badge>}
          <div className="spacer"/>
          <button className={"btn btn-sm " + (compared ? "btn-primary" : "")} onClick={e => { e.stopPropagation(); onCompare(); }}>
            {compared ? <><IconCheck/> Compare</> : "+ Compare"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 180ms" }}><IconChev/></button>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>{rec.reason}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, paddingTop: 4 }}>
          <DimMini label="reliability" value={rec.successRate * 100} valueLabel={fmtPct(rec.successRate)} color="var(--success)"/>
          <DimMini label="latency" value={Math.max(0, 1 - rec.avgLatencyMs / 2000) * 100} valueLabel={fmtMs(rec.avgLatencyMs)} color="var(--accent)"/>
          <DimMini label="popularity" value={rec.popularityScore * 100} valueLabel={(rec.popularityScore * 100).toFixed(0)} color="var(--violet)"/>
          <DimMini label="sentiment" value={rec.sentimentScore * 100} valueLabel={(rec.sentimentScore * 5).toFixed(1) + "★"} color="var(--info)"/>
        </div>
        {open && (
          <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
            <div className="col" style={{ gap: 6, fontSize: 11.5 }}>
              <div className="row" style={{ gap: 14 }}>
                <span className="muted-2 mono">p95</span><span className="mono">{fmtMs(rec.p95LatencyMs)}</span>
                <span className="muted-2 mono">pricing</span><span className="mono">{rec.pricingModel || "—"}</span>
                <span className="muted-2 mono">residency</span><span className="mono">{rec.dataResidency.join(" · ") || "—"}</span>
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
  return (
    <div className="card card-pad fade-up" data-compared={compared ? "true" : undefined} style={{ display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
      <button className="compact-compare" data-active={compared ? "true" : undefined} onClick={e => { e.stopPropagation(); onCompare(); }} title="Compare">
        {compared ? <IconCheck/> : <IconPlus/>}
      </button>
      <div onClick={() => router.push("/tools/" + rec.slug)} style={{ display: "contents", cursor: "default" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="mono muted-2" style={{ fontSize: 10.5 }}>#{rank}</span>
          <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>{Math.round(rec.score)}<span className="muted-2" style={{ fontSize: 10 }}>/100</span></span>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <ToolIcon slug={rec.slug} name={rec.name} size={28}/>
          <div className="col" style={{ gap: 0 }}>
            <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 600 }}>{rec.name}</h4>
            <span className="mono muted-2" style={{ fontSize: 10.5 }}>{rec.category.replace("_", " ")}</span>
          </div>
        </div>
        <div className="bar"><div className="bar-fill" style={{ width: rec.score + "%" }}/></div>
        <div className="row" style={{ justifyContent: "space-between", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>
          <span>{fmtPct(rec.successRate)}</span>
          <span>{fmtMs(rec.avgLatencyMs)}</span>
          <span>{(rec.sentimentScore * 5).toFixed(1)}★</span>
        </div>
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
        const radius = 12 + (1 - r.score / 100) * 32;
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        return (
          <div key={r.slug} className="rec-node" data-selected={i === 0 ? "true" : undefined} style={{ left: x + "%", top: y + "%" }} onClick={() => router.push("/tools/" + r.slug)}>
            <div className="row" style={{ gap: 6 }}>
              <ToolIcon slug={r.slug} name={r.name} size={20}/>
              <span className="rec-node-name">{r.name}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="rec-node-score">★ {Math.round(r.score)}</span>
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
  const [task, setTask] = useState("Send transactional emails to verified users with low p95 latency");
  const [submittedTask, setSubmittedTask] = useState("Send transactional emails to verified users with low p95 latency");
  const [cat, setCat] = useState("");
  const [oss, setOss] = useState(false);
  const [selfHosted, setSelfHosted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [style, setStyle] = useState<"ranked" | "compact" | "galaxy">(tweaks.recCard as "ranked" | "compact" | "galaxy");
  const [compareItems, setCompareItems] = useState<Rec[]>([]);

  useEffect(() => { setStyle(tweaks.recCard as "ranked" | "compact" | "galaxy"); }, [tweaks.recCard]);

  const toggleCompare = (rec: Rec) => {
    setCompareItems(prev => {
      if (prev.find(x => x.slug === rec.slug)) return prev.filter(x => x.slug !== rec.slug);
      if (prev.length >= 3) return [prev[1], prev[2], rec];
      return [...prev, rec];
    });
  };

  const recs: Rec[] = useMemo(() => {
    let pool = TOOLS_DATA.slice();
    if (cat) pool = pool.filter(t => t.category === cat);
    if (oss) pool = pool.filter(t => t.isOpenSource);
    if (selfHosted) pool = pool.filter(t => t.isSelfHostable);
    const matchedCat = Object.entries(HINTS).find(([, re]) => re.test(submittedTask));
    if (matchedCat && !cat) pool = pool.filter(t => t.category === matchedCat[0]);
    return pool.map(t => {
      const success = parseFloat(t.successRate || "0");
      const popularity = parseFloat(t.popularityScore || "0");
      const sentiment = parseFloat(t.sentimentScore || "0");
      const latencyScore = Math.max(0, 1 - parseInt(t.avgLatencyMs || "0") / 2000);
      const isCold = (t.totalCalls || 0) < 50;
      const score = Math.min(isCold ? 70 : 100, success * 40 + latencyScore * 20 + popularity * 25 + sentiment * 15);
      return { slug: t.slug, name: t.name, category: t.category, score, successRate: success, avgLatencyMs: parseInt(t.avgLatencyMs), p95LatencyMs: parseInt(t.p95LatencyMs), popularityScore: popularity, sentimentScore: sentiment, isOpenSource: t.isOpenSource, isSelfHostable: t.isSelfHostable, pricingModel: t.pricingModel, dataResidency: t.dataResidency, reason: buildReason(t, success, latencyScore, popularity, sentiment), isCold, docsUrl: t.docsUrl };
    }).sort((a, b) => b.score - a.score).slice(0, 5);
  }, [submittedTask, cat, oss, selfHosted]);

  const submit = () => {
    setLoading(true);
    setTimeout(() => { setSubmittedTask(task); setLoading(false); }, 600);
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
            <button className="btn btn-primary" onClick={submit} style={{ alignSelf: "stretch", padding: "0 16px" }}>
              {loading ? <span className="spinner"/> : <IconZap/>}
              {loading ? "Ranking..." : "Recommend"}
            </button>
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
            <select className="select" value={cat} onChange={e => setCat(e.target.value)}>
              <option value="">auto-detect category</option>
              {TOOL_CATEGORIES.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
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

      {recs.length === 0 ? (
        <div className="card card-pad muted" style={{ textAlign: "center" }}>No tools match. Try removing filters.</div>
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
                const vals = compareItems.map(r => (r as Record<string, number>)[d.key]);
                const winner = d.inverted ? Math.min(...vals) : Math.max(...vals);
                return (
                  <React.Fragment key={d.key}>
                    <div className="compare-row-label">{d.label}</div>
                    {compareItems.map(r => {
                      const v = (r as Record<string, number>)[d.key];
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
    </div>
  );
}
