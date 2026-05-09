"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TOOL_CATEGORIES } from "@/lib/data";
import { fmtNum, fmtMs, fmtPct } from "@/lib/format";
import { Badge, ToolIcon } from "@/components/ui/primitives";
import { IconSearch } from "@/components/ui/icons";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";
import type { ToolListItem } from "@agentgraph/types";

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="col" style={{ gap: 3 }}>
      <span className="mono muted-2" style={{ fontSize: 9.5, letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
      <span className="mono tnum" style={{ fontSize: 13, fontWeight: 500, color }}>{value}</span>
    </div>
  );
}

export default function ToolsPageClient() {
  const { token, loading: projectLoading } = useProject();
  const [tools, setTools] = useState<ToolListItem[]>([]);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [pricing, setPricing] = useState("");
  const [oss, setOss] = useState(false);
  const [sortBy, setSortBy] = useState("popularity");
  const [fetching, setFetching] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!token) return;
    setFetching(true);
    apiGet<{ tools: ToolListItem[] }>("/v1/tools?limit=100", token)
      .then(data => setTools(data.tools))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [token]);

  const filtered = useMemo(() => {
    let list = tools.slice();
    if (cat) list = list.filter(t => t.category === cat);
    if (pricing) list = list.filter(t => t.pricingModel === pricing);
    if (oss) list = list.filter(t => t.isOpenSource);
    if (q) list = list.filter(t => ((t.name ?? "") + " " + (t.description ?? "") + " " + (t.tags ?? []).join(" ")).toLowerCase().includes(q.toLowerCase()));
    list.sort((a, b) => {
      if (sortBy === "popularity") return parseFloat(b.popularityScore ?? "0") - parseFloat(a.popularityScore ?? "0");
      if (sortBy === "success") return parseFloat(b.successRate ?? "0") - parseFloat(a.successRate ?? "0");
      if (sortBy === "latency") return (a.avgLatencyMs ?? 9999) - (b.avgLatencyMs ?? 9999);
      return 0;
    });
    return list;
  }, [tools, cat, q, pricing, oss, sortBy]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    tools.forEach(t => { c[t.category] = (c[t.category] ?? 0) + 1; });
    return c;
  }, [tools]);

  if (projectLoading || fetching) {
    return <div className="fade-up"><div className="page-h"><div><h1>Tool catalog</h1></div></div><div className="card card-pad muted" style={{ textAlign: "center" }}>Loading…</div></div>;
  }

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Tool catalog</h1>
          <div className="sub">{tools.length} tools across {TOOL_CATEGORIES.length} categories · benchmarks updated 4h ago</div>
        </div>
        <div className="row">
          <div className="kbar" style={{ minWidth: 240 }}>
            <IconSearch/>
            <input placeholder="Filter tools..." value={q} onChange={e => setQ(e.target.value)}/>
          </div>
        </div>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        <span className="chip" data-active={cat === "" ? "true" : undefined} onClick={() => setCat("")}>all <span className="muted-2 mono">{tools.length}</span></span>
        {TOOL_CATEGORIES.filter(c => counts[c]).map(c => (
          <span key={c} className="chip" data-active={cat === c ? "true" : undefined} onClick={() => setCat(c)}>
            {c.replace("_", " ")} <span className="muted-2 mono">{counts[c]}</span>
          </span>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <span className="mono muted-2" style={{ fontSize: 10.5 }}>SORT</span>
        <div className="seg">
          <button data-active={sortBy === "popularity" ? "true" : "false"} onClick={() => setSortBy("popularity")}>Popular</button>
          <button data-active={sortBy === "success" ? "true" : "false"} onClick={() => setSortBy("success")}>Success</button>
          <button data-active={sortBy === "latency" ? "true" : "false"} onClick={() => setSortBy("latency")}>Fastest</button>
        </div>
        <div className="spacer"/>
        <label className="row" style={{ gap: 6, cursor: "default", fontSize: 12 }}>
          <input type="checkbox" checked={oss} onChange={e => setOss(e.target.checked)}/>
          Open source only
        </label>
        <select className="select" value={pricing} onChange={e => setPricing(e.target.value)}>
          <option value="">any pricing</option>
          <option value="free">free</option>
          <option value="freemium">freemium</option>
          <option value="paid">paid</option>
          <option value="open_source">open source</option>
        </select>
        <span className="mono muted-2" style={{ fontSize: 11 }}>{filtered.length} results</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {filtered.map(tool => {
          const isCold = (tool.totalCalls ?? 0) < 50;
          return (
            <div key={tool.slug} className="tool-card" onClick={() => router.push("/tools/" + tool.slug)}>
              <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                <ToolIcon slug={tool.slug} name={tool.name}/>
                <div className="grow col" style={{ gap: 2 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <h4>{tool.name}</h4>
                    {tool.isOpenSource && <Badge>oss</Badge>}
                    {isCold ? <Badge tone="info">seeded</Badge> : <Badge tone="ok"><span className="dot"/>live</Badge>}
                  </div>
                  <div className="mono muted-2" style={{ fontSize: 10.5 }}>{tool.category.replace("_", " ")}</div>
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{tool.description}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, paddingTop: 4 }}>
                <Metric label="success" value={fmtPct(tool.successRate)} color="var(--success)"/>
                <Metric label="p50" value={fmtMs(tool.avgLatencyMs ?? undefined)} color="var(--accent)"/>
                <Metric label="p95" value={fmtMs(tool.p95LatencyMs ?? undefined)} color="var(--info)"/>
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 4, paddingTop: 4 }}>
                {(tool.tags ?? []).slice(0, 3).map(tag => <span key={tag} className="chip" style={{ fontSize: 10.5, padding: "1px 7px" }}>{tag}</span>)}
                <div className="spacer"/>
                <span className="mono muted-2" style={{ fontSize: 10.5 }}>{fmtNum(tool.totalCalls ?? 0)} calls</span>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="card card-pad muted" style={{ textAlign: "center" }}>No tools match the filter.</div>}
    </div>
  );
}
