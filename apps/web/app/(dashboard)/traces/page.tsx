"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fmtNum, fmtMs, fmtMoney, relTime } from "@/lib/format";
import { StatusBadge, EnvBadge } from "@/components/ui/primitives";
import { IconExt, IconChev } from "@/components/ui/icons";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";

interface Trace {
  id: string;
  agentId: string;
  env: string;
  status: "running" | "completed" | "error";
  totalLatencyMs: number | null;
  totalTokens: number | null;
  totalCostUsd: string | null;
  startedAt: string;
}

export default function TracesPage() {
  const { project, token, loading: projectLoading } = useProject();
  const [traces, setTraces] = useState<Trace[]>([]);
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [envFilter, setEnvFilter] = useState("");
  const [page, setPage] = useState(1);
  const [fetching, setFetching] = useState(false);
  const router = useRouter();
  const limit = 20;

  useEffect(() => {
    if (!project || !token) return;
    setFetching(true);
    apiGet<{ traces: Trace[] }>(`/v1/traces?projectId=${project.id}&limit=100`, token)
      .then(data => setTraces(data.traces))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [project, token]);

  const agents = useMemo(() => [...new Set(traces.map(t => t.agentId))].sort(), [traces]);

  const filtered = useMemo(() =>
    traces.filter(t => {
      if (agentFilter && t.agentId !== agentFilter) return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (envFilter && t.env !== envFilter) return false;
      return true;
    }), [traces, agentFilter, statusFilter, envFilter]);

  useEffect(() => setPage(1), [agentFilter, statusFilter, envFilter]);

  const paged = filtered.slice((page - 1) * limit, page * limit);
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));

  if (projectLoading || fetching) {
    return <div className="fade-up"><div className="page-h"><div><h1>Traces</h1></div></div><div className="card card-pad muted" style={{ textAlign: "center" }}>Loading…</div></div>;
  }

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Traces</h1>
          <div className="sub">{filtered.length.toLocaleString()} traces · streaming live</div>
        </div>
        <div className="row">
          <button className="btn"><IconExt/> Export CSV</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="mono muted-2" style={{ fontSize: 10.5, padding: "0 6px" }}>AGENT</span>
            <select className="select" value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
              <option value="">all agents</option>
              {agents.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="mono muted-2" style={{ fontSize: 10.5, padding: "0 6px" }}>STATUS</span>
            <div className="seg">
              {["", "running", "completed", "error"].map(s => (
                <button key={s} data-active={statusFilter === s ? "true" : "false"} onClick={() => setStatusFilter(s)}>{s || "all"}</button>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <span className="mono muted-2" style={{ fontSize: 10.5, padding: "0 6px" }}>ENV</span>
            <div className="seg">
              {["", "prod", "staging", "dev"].map(s => (
                <button key={s} data-active={envFilter === s ? "true" : "false"} onClick={() => setEnvFilter(s)}>{s || "all"}</button>
              ))}
            </div>
          </div>
          <div className="spacer"/>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAgentFilter(""); setStatusFilter(""); setEnvFilter(""); }}>Clear</button>
        </div>
      </div>

      <div className="card">
        <table className="tbl">
          <thead><tr>
            <th>Trace ID</th><th>Agent</th><th>Env</th><th>Status</th><th>Latency</th><th>Tokens</th><th>Cost</th><th>Started</th><th></th>
          </tr></thead>
          <tbody>
            {paged.map(t => (
              <tr key={t.id} onClick={() => router.push("/traces/" + t.id)} style={{ cursor: "default" }}>
                <td className="mono" style={{ fontSize: 11.5 }}>
                  <div className="row" style={{ gap: 8 }}>
                    {t.status === "running" && <span className="pulse-dot" style={{ flexShrink: 0 }}/>}
                    {t.id}
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 11.5 }}>{t.agentId}</td>
                <td><EnvBadge env={t.env}/></td>
                <td><StatusBadge status={t.status}/></td>
                <td className="mono tnum muted">{fmtMs(t.totalLatencyMs ?? undefined)}</td>
                <td className="mono tnum muted">{fmtNum(t.totalTokens ?? undefined)}</td>
                <td className="mono tnum muted">{fmtMoney(t.totalCostUsd ?? undefined)}</td>
                <td className="mono tnum muted-2" style={{ fontSize: 11 }}>{relTime(t.startedAt)}</td>
                <td style={{ width: 30 }}><IconChev/></td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", padding: 24 }} className="muted">No traces found.</td></tr>
            )}
          </tbody>
        </table>
        <div className="row" style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", justifyContent: "space-between" }}>
          <span className="mono muted-2" style={{ fontSize: 11 }}>{filtered.length === 0 ? "0–0 of 0" : `${(page - 1) * limit + 1}–${Math.min(page * limit, filtered.length)} of ${filtered.length}`}</span>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-sm" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</button>
            <span className="mono" style={{ fontSize: 11 }}>{page} / {totalPages}</span>
            <button className="btn btn-sm" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
