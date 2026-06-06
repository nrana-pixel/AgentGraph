"use client";
// Tier 3.1 / 3.5 — trace-driven tool-swap recommendations + shadow-mode replay.
// Self-contained panel rendered from the Recommend page. Calls the new
// /v1/projects/:id/insights/* endpoints (NOT the catalog FTS recommender).
import { Fragment, useState } from "react";
import type {
  SwapRecommendation,
  SwapRecommendationsResponse,
  ShadowReplayResponse,
} from "@agentgraph/types";
import { fmtMs, fmtPct } from "@/lib/format";
import { useProject } from "@/hooks/useProject";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/components/ui/toast";

function DeltaPill({
  delta,
  betterIsLower,
  fmt,
}: {
  delta: number | null;
  betterIsLower: boolean;
  fmt: (n: number) => string;
}) {
  if (delta === null) {
    return <span className="mono muted-2" style={{ fontSize: 11 }}>—</span>;
  }
  const improvement = betterIsLower ? delta < 0 : delta > 0;
  const neutral = delta === 0;
  const color = neutral ? "var(--text-3)" : improvement ? "var(--success)" : "var(--error)";
  const sign = delta > 0 ? "+" : "";
  return (
    <span className="mono tnum" style={{ fontSize: 11.5, color, fontWeight: 600 }}>
      {sign}
      {fmt(delta)}
    </span>
  );
}

function ShadowResult({ r }: { r: ShadowReplayResponse }) {
  const rows: { label: string; observed: number | null; projected: number | null; fmt: (n: number) => string }[] = [
    { label: "p50 latency", observed: r.p50LatencyMs.observed, projected: r.p50LatencyMs.projected, fmt: (n) => fmtMs(n) },
    { label: "p95 latency", observed: r.p95LatencyMs.observed, projected: r.p95LatencyMs.projected, fmt: (n) => fmtMs(n) },
    { label: "error rate", observed: r.errorRate.observed, projected: r.errorRate.projected, fmt: (n) => fmtPct(n) },
    { label: "cost (total)", observed: r.costUsd.observed, projected: r.costUsd.projected, fmt: (n) => "$" + n.toFixed(4) },
  ];
  return (
    <div className="card card-pad fade-up" style={{ marginTop: 8, gap: 10, display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="mono muted-2" style={{ fontSize: 10.5, letterSpacing: "0.05em" }}>
          SHADOW REPLAY · {r.callsAnalyzed} calls · last {r.windowDays}d
        </span>
        {r.netLatencyImprovementMs !== null && (
          <span
            className="mono tnum"
            style={{ fontSize: 11.5, fontWeight: 600, color: r.netLatencyImprovementMs > 0 ? "var(--success)" : "var(--error)" }}
          >
            {r.netLatencyImprovementMs > 0 ? "−" : "+"}
            {fmtMs(Math.abs(r.netLatencyImprovementMs))} p95
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: "4px 12px", fontSize: 12 }}>
        <span className="mono muted-2" style={{ fontSize: 10 }}>metric</span>
        <span className="mono muted-2" style={{ fontSize: 10 }}>observed</span>
        <span className="mono muted-2" style={{ fontSize: 10 }}>projected</span>
        {rows.map((row) => (
          <Fragment key={row.label}>
            <span className="muted-2" style={{ fontSize: 11 }}>{row.label}</span>
            <span className="mono tnum" style={{ fontSize: 11.5 }}>
              {row.observed !== null ? row.fmt(row.observed) : "—"}
            </span>
            <span className="mono tnum" style={{ fontSize: 11.5 }}>
              {row.projected !== null ? row.fmt(row.projected) : <span className="muted-2">n/a</span>}
            </span>
          </Fragment>
        ))}
      </div>
      {r.notes.map((n, i) => (
        <div key={i} className="muted-2" style={{ fontSize: 10.5, lineHeight: 1.4 }}>· {n}</div>
      ))}
    </div>
  );
}

function SwapCard({ rec, getToken, projectId }: { rec: SwapRecommendation; getToken: () => Promise<string | null>; projectId: string }) {
  const [replaying, setReplaying] = useState(false);
  const [shadow, setShadow] = useState<ShadowReplayResponse | null>(null);
  const toast = useToast();

  const runReplay = async () => {
    const t = await getToken();
    if (!t) return;
    setReplaying(true);
    apiPost<ShadowReplayResponse>(`/v1/projects/${projectId}/insights/shadow-replay`, t, {
      currentTool: rec.currentTool,
      candidateSlug: rec.suggestedTool,
      windowDays: 14,
    })
      .then(setShadow)
      .catch((err: Error) => toast(`Shadow replay failed: ${err.message}`))
      .finally(() => setReplaying(false));
  };

  return (
    <div className="card card-pad fade-up" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ gap: 10, alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{rec.currentTool}</span>
        <span className="mono muted-2" style={{ fontSize: 14 }}>→</span>
        <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>{rec.suggestedName}</span>
        <span className="badge">{rec.category.replace("_", " ")}</span>
        <div className="spacer" />
        <span className="mono tnum" style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>
          {Math.round(rec.score)}<span className="muted-2" style={{ fontSize: 10 }}>/100</span>
        </span>
      </div>
      <div className="muted" style={{ fontSize: 12 }}>{rec.reason}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, paddingTop: 2 }}>
        <div className="col" style={{ gap: 2 }}>
          <span className="mono muted-2" style={{ fontSize: 10 }}>p95 latency</span>
          <DeltaPill delta={rec.latency.delta} betterIsLower={rec.latency.betterIsLower} fmt={(n) => fmtMs(Math.abs(n))} />
        </div>
        <div className="col" style={{ gap: 2 }}>
          <span className="mono muted-2" style={{ fontSize: 10 }}>reliability</span>
          <DeltaPill delta={rec.reliability.delta} betterIsLower={rec.reliability.betterIsLower} fmt={(n) => (Math.abs(n) * 100).toFixed(1) + "pp"} />
        </div>
        <div className="col" style={{ gap: 2 }}>
          <span className="mono muted-2" style={{ fontSize: 10 }}>cost / call</span>
          <span className="mono muted-2" style={{ fontSize: 11 }}>
            {rec.cost.current !== null ? "$" + rec.cost.current.toFixed(4) : "—"}
          </span>
        </div>
        <div className="col" style={{ gap: 2 }}>
          <span className="mono muted-2" style={{ fontSize: 10 }}>schema fit</span>
          <span className="mono tnum" style={{ fontSize: 11.5 }}>
            {rec.schemaFit !== null ? (rec.schemaFit * 100).toFixed(0) + "%" : <span className="muted-2">unknown</span>}
          </span>
        </div>
      </div>
      <div className="row" style={{ gap: 6, paddingTop: 2 }}>
        <button className="btn btn-sm" onClick={runReplay} disabled={replaying}>
          {replaying ? <span className="spinner" /> : null}
          {replaying ? "Replaying…" : "Run shadow replay"}
        </button>
        <span className="mono muted-2" style={{ fontSize: 10 }}>offline projection · no live routing</span>
      </div>
      {shadow && <ShadowResult r={shadow} />}
    </div>
  );
}

export default function TraceSwapInsights() {
  const { project, getToken } = useProject();
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [recs, setRecs] = useState<SwapRecommendation[]>([]);
  const toast = useToast();

  const load = async () => {
    if (!project) return;
    const t = await getToken();
    if (!t) return;
    setLoading(true);
    apiGet<SwapRecommendationsResponse>(`/v1/projects/${project.id}/insights/recommendations`, t)
      .then((d) => {
        setRecs(d.recommendations);
        setLoaded(true);
      })
      .catch((err: Error) => toast(`Failed to load swap insights: ${err.message}`))
      .finally(() => setLoading(false));
  };

  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="col" style={{ gap: 2 }}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Tool-swap insights</h2>
            <div className="muted" style={{ fontSize: 12.5 }}>
              Based on the tools your agents actually call. Compare same-category alternatives and
              run an offline shadow replay against your recorded traces.
            </div>
          </div>
          <div className="spacer" />
          <button className="btn btn-primary btn-sm" onClick={load} disabled={loading || !project}>
            {loading ? <span className="spinner" /> : null}
            {loading ? "Analyzing…" : loaded ? "Refresh" : "Analyze my tools"}
          </button>
        </div>

        {!loaded ? (
          <div className="muted-2 mono" style={{ fontSize: 11, padding: "6px 0" }}>
            {loading ? "Aggregating trace_steps…" : "Click Analyze to compute swap recommendations from your traces."}
          </div>
        ) : recs.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5, padding: "6px 0" }}>
            No swap candidates yet. This appears once your project records tool calls for catalog tools
            that have higher-scoring same-category alternatives.
          </div>
        ) : (
          <div className="col" style={{ gap: 10 }}>
            {project && recs.map((rec) => (
              <SwapCard key={rec.currentTool + "→" + rec.suggestedTool} rec={rec} getToken={getToken} projectId={project.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
