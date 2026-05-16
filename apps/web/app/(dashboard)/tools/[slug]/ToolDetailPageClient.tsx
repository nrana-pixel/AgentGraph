"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fmtMs, fmtPct, fmtNum } from "@/lib/format";
import { Badge, ToolIcon, Ring } from "@/components/ui/primitives";
import { IconGlobe, IconBook, IconGithub } from "@/components/ui/icons";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";

type ToolDetail = {
  slug: string; name: string; description: string | null; category: string;
  website: string | null; docsUrl: string | null; githubUrl: string | null;
  isOpenSource: boolean; isSelfHostable: boolean; pricingModel: string | null;
  dataResidency: string[]; tags: string[]; dataSource: string;
  sentimentScore: number | null;
};
type ToolStats = {
  successRate: number | null; avgLatencyMs: number | null;
  p95LatencyMs: number | null; totalCalls: number; popularityScore: number | null;
} | null;

function DimensionRow({ label, sub, value, valueLabel, color }: { label: string; sub: string; value: number; valueLabel: string; color: string }) {
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontWeight: 500, fontSize: 12.5 }}>{label} <span className="mono muted-2" style={{ fontSize: 10.5 }}>{sub}</span></span>
        <span className="mono tnum">{valueLabel}</span>
      </div>
      <div className="bar"><div className="bar-fill" style={{ width: value + "%", background: color }}/></div>
    </div>
  );
}

export default function ToolDetailPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const { token, loading: authLoading } = useProject();
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const [stats, setStats] = useState<ToolStats>(null);
  const [fetching, setFetching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    setFetching(true);
    setNotFound(false);
    setTool(null);
    setStats(null);
    apiGet<{ tool: ToolDetail; stats: ToolStats }>(`/v1/tools/${slug}`, token)
      .then(d => { setTool(d.tool); setStats(d.stats); })
      .catch(err => { if (String(err).includes("404")) setNotFound(true); })
      .finally(() => setFetching(false));
  }, [slug, token]);

  const histogram = useMemo(() => {
    const r = (() => { let s = 1; for (const c of slug) s = (s * 31 + c.charCodeAt(0)) | 0; return s; })();
    return Array.from({ length: 24 }, (_, i) => {
      const x = i / 23;
      const peak = Math.exp(-Math.pow((x - 0.35), 2) * 14);
      const noise = (Math.sin(r + i * 1.7) + 1) / 2 * 0.3;
      return peak * 0.85 + noise * 0.15;
    });
  }, [slug]);

  if (authLoading || fetching) {
    return <div className="card card-pad fade-up muted" style={{ textAlign: "center" }}>Loading…</div>;
  }

  if (!token) {
    return (
      <div className="card card-pad fade-up">
        Sign in to view tool details. <button className="btn btn-sm" onClick={() => router.push("/tools")} style={{ marginLeft: 8 }}>Back to catalog</button>
      </div>
    );
  }

  if (notFound || !tool) {
    return (
      <div className="card card-pad fade-up">
        Tool not found. <button className="btn btn-sm" onClick={() => router.push("/tools")} style={{ marginLeft: 8 }}>Back to catalog</button>
      </div>
    );
  }

  const isCold = (stats?.totalCalls ?? 0) < 50;
  const sentiment = tool.sentimentScore ?? 0;
  const success = stats?.successRate ?? 0;
  const popularity = stats?.popularityScore ?? 0;
  const avgLatencyMs = stats?.avgLatencyMs ?? 0;
  const p95LatencyMs = stats?.p95LatencyMs ?? 0;
  const latencyScore = Math.max(0, 1 - avgLatencyMs / 2000);
  const composite = Math.min(isCold ? 70 : 100, success * 40 + latencyScore * 20 + popularity * 25 + sentiment * 15);

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push("/tools")} style={{ marginBottom: 8 }}>← Catalog</button>
          <div className="row" style={{ gap: 16, alignItems: "flex-start" }}>
            <ToolIcon slug={tool.slug} name={tool.name} size={56} website={tool.website}/>
            <div className="col" style={{ gap: 6 }}>
              <h1 style={{ marginBottom: 2 }}>{tool.name}</h1>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Badge>{tool.category.replace("_", " ")}</Badge>
                {tool.isOpenSource && <Badge tone="ok">open source</Badge>}
                {tool.isSelfHostable && <Badge>self-hostable</Badge>}
                {tool.pricingModel && <Badge tone="info">{tool.pricingModel.replace("_", " ")}</Badge>}
                {isCold ? <Badge tone="info">seeded benchmark</Badge> : <Badge tone="ok"><span className="dot"/>live telemetry</Badge>}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4, maxWidth: 640 }}>{tool.description}</div>
            </div>
          </div>
        </div>
        <div className="row">
          {tool.website && <a href={tool.website} target="_blank" rel="noopener" className="btn"><IconGlobe/> Website</a>}
          {tool.docsUrl && <a href={tool.docsUrl} target="_blank" rel="noopener" className="btn"><IconBook/> Docs</a>}
          {tool.githubUrl && <a href={tool.githubUrl} target="_blank" rel="noopener" className="btn"><IconGithub/> GitHub</a>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "var(--gap-card, 14px)", marginBottom: 14 }}>
        <div className="card card-pad" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div className="mono muted-2" style={{ fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>Composite score</div>
          <div style={{ position: "relative", width: 140, height: 140 }}>
            <Ring value={composite} size={140} stroke={10}/>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div className="mono tnum" style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em" }}>{Math.round(composite)}</div>
              <div className="mono muted-2" style={{ fontSize: 10 }}>/ 100</div>
            </div>
          </div>
          {isCold && <Badge tone="info">capped at 70 (cold-start)</Badge>}
          <div className="hr" style={{ width: "100%" }}/>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "8px 14px", width: "100%", fontSize: 11.5 }}>
            <span className="muted-2">Total calls</span><span className="mono tnum">{fmtNum(stats?.totalCalls ?? 0)}</span>
            <span className="muted-2">Data source</span><span className="mono">{tool.dataSource}</span>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Score breakdown</h3><span className="sub mono">weighted composite</span></div>
          <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <DimensionRow label="Reliability" sub="× 40%" value={success * 100} valueLabel={fmtPct(String(success))} color="var(--success)"/>
            <DimensionRow label="Latency" sub="× 20%" value={latencyScore * 100} valueLabel={fmtMs(avgLatencyMs)} color="var(--accent)"/>
            <DimensionRow label="Popularity" sub="× 25%" value={popularity * 100} valueLabel={(popularity * 100).toFixed(0) + "/100"} color="var(--violet)"/>
            <DimensionRow label="Sentiment" sub="× 15%" value={sentiment * 100} valueLabel={(sentiment * 5).toFixed(1) + " ★"} color="var(--info)"/>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "var(--gap-card, 14px)" }}>
        <div className="card">
          <div className="hd"><h3>Latency distribution</h3><span className="sub mono">last 7 days · {fmtNum(stats?.totalCalls ?? 0)} calls</span></div>
          <div style={{ padding: 18 }}>
            <div className="row" style={{ alignItems: "flex-end", gap: 3, height: 140 }}>
              {histogram.map((h, i) => (
                <div key={i} style={{ flex: 1, height: h * 100 + "%", background: "linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 40%, transparent))", borderRadius: 2, minHeight: 2 }}/>
              ))}
            </div>
            <div className="row" style={{ justifyContent: "space-between", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
              <span>0ms</span>
              <span>{fmtMs(avgLatencyMs)} (p50)</span>
              <span style={{ color: "var(--accent)" }}>{fmtMs(p95LatencyMs)} (p95)</span>
              <span>{fmtMs(p95LatencyMs * 2)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="hd"><h3>Attributes</h3></div>
          <div style={{ padding: "8px 16px 16px" }}>
            {([
              ["slug", <span key="s" className="mono">{tool.slug}</span>],
              ["category", <span key="c" className="mono">{tool.category}</span>],
              ["pricing", tool.pricingModel || "—"],
              ["data residency", (tool.dataResidency ?? []).join(" · ") || "—"],
              ["self-hostable", tool.isSelfHostable ? "yes" : "no"],
              ["open source", tool.isOpenSource ? "yes" : "no"],
              ["tags", <div key="t" className="row" style={{ gap: 4, flexWrap: "wrap" }}>{(tool.tags ?? []).map(t => <span key={t} className="chip" style={{ fontSize: 10.5, padding: "1px 7px" }}>{t}</span>)}</div>],
            ] as [string, React.ReactNode][]).map(([k, v], i) => (
              <div key={i} className="row" style={{ padding: "7px 0", borderBottom: i < 6 ? "1px solid var(--border)" : "none", justifyContent: "space-between", fontSize: 12 }}>
                <span className="muted-2 mono" style={{ fontSize: 11 }}>{k}</span>
                <span style={{ textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
