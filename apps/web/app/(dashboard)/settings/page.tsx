"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fmtNum } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { IconPlus, IconTrash, IconCopy, IconZap } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useProject } from "@/hooks/useProject";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

type ApiKey = { id: string; name: string | null; keyPrefix: string; lastUsedAt: string | null; createdAt: string };
type Webhook = { id: string; url: string; events: string[]; enabled: boolean; createdAt: string };
type Billing = { plan: string; tracesUsed: number; tracesLimit: number; usagePct: number };

const PLAN_COLORS: Record<string, string> = { free: "info", pro: "violet", team: "ok" };
const ALL_EVENTS = ["cost_spike", "error_rate_threshold", "trace_completed"];

export default function SettingsPage() {
  const router = useRouter();
  const { project, token, loading: projectLoading } = useProject();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [newWh, setNewWh] = useState({ url: "", events: ["cost_spike"] as string[] });
  const [fetching, setFetching] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!project || !token) return;
    setFetching(true);
    Promise.all([
      apiGet<{ apiKeys: ApiKey[] }>(`/v1/projects/${project.id}/api-keys`, token),
      apiGet<Billing>(`/v1/projects/${project.id}/billing`, token),
      apiGet<{ webhooks: Webhook[] }>(`/v1/projects/${project.id}/webhooks`, token),
    ])
      .then(([k, b, w]) => { setKeys(k.apiKeys); setBilling(b); setWebhooks(w.webhooks); })
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [project, token]);

  const createKey = async () => {
    if (!keyName.trim() || !project || !token) return;
    try {
      const data = await apiPost<{ id: string; keyPrefix: string; key: string; name: string | null; createdAt: string }>(
        `/v1/projects/${project.id}/api-keys`, token, { name: keyName.trim() },
      );
      setCreatedKey(data.key);
      setKeys(prev => [{ id: data.id, name: data.name, keyPrefix: data.keyPrefix, lastUsedAt: null, createdAt: data.createdAt }, ...prev]);
      setKeyName("");
    } catch { toast("Failed to create key"); }
  };

  const revokeKey = async (id: string) => {
    if (!project || !token) return;
    try {
      await apiDelete(`/v1/projects/${project.id}/api-keys/${id}`, token);
      setKeys(prev => prev.filter(k => k.id !== id));
      toast("Key revoked");
    } catch { toast("Failed to revoke key"); }
  };

  const copyKey = (raw: string) => { navigator.clipboard?.writeText?.(raw); toast("Copied to clipboard"); };

  const addWebhook = async () => {
    if (!newWh.url.trim() || !newWh.url.startsWith("https://")) {
      toast("URL must start with https://"); return;
    }
    if (!project || !token) return;
    try {
      const data = await apiPost<Webhook>(`/v1/projects/${project.id}/webhooks`, token, { url: newWh.url.trim(), events: newWh.events });
      setWebhooks(prev => [data, ...prev]);
      setNewWh({ url: "", events: ["cost_spike"] });
      toast("Webhook added");
    } catch { toast("Failed to add webhook"); }
  };

  const toggleWebhook = async (id: string) => {
    if (!project || !token) return;
    const wh = webhooks.find(w => w.id === id);
    if (!wh) return;
    try {
      await apiPatch(`/v1/projects/${project.id}/webhooks/${id}`, token, { enabled: !wh.enabled });
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
    } catch { toast("Failed to update webhook"); }
  };

  const deleteWebhook = async (id: string) => {
    if (!project || !token) return;
    try {
      await apiDelete(`/v1/projects/${project.id}/webhooks/${id}`, token);
      setWebhooks(prev => prev.filter(w => w.id !== id));
      toast("Webhook removed");
    } catch { toast("Failed to remove webhook"); }
  };

  const usagePct = billing ? billing.usagePct : 0;
  const barColor = usagePct > 0.9 ? "var(--error)" : usagePct > 0.7 ? "var(--warn)" : "var(--success)";

  if (projectLoading || fetching) {
    return <div className="fade-up"><div className="page-h"><div><h1>Settings</h1></div></div><div className="card card-pad muted" style={{ textAlign: "center" }}>Loading…</div></div>;
  }

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Settings</h1>
          <div className="sub">Manage API keys, webhooks, and billing.</div>
        </div>
      </div>

      {/* Billing card */}
      {billing && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd"><h3>Billing & plan</h3>
            <Badge tone={PLAN_COLORS[billing.plan] as "violet" | "ok" | "info"}>{billing.plan}</Badge>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="col" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
                <span className="muted-2">Monthly traces</span>
                <span className="mono tnum">
                  {fmtNum(billing.tracesUsed)} <span className="muted-2">/ {fmtNum(billing.tracesLimit)}</span>
                </span>
              </div>
              <div className="bar" style={{ height: 8 }}>
                <div className="bar-fill" style={{ width: (usagePct * 100) + "%", background: barColor }}/>
              </div>
              <div className="row" style={{ justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
                <span>{(usagePct * 100).toFixed(1)}% used</span>
                {usagePct > 0.8 && <span style={{ color: "var(--warn)" }}>approaching limit</span>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "10px 16px", fontSize: 12 }}>
              <span className="muted-2">Plan</span>
              <span className="mono" style={{ textTransform: "capitalize" }}>{billing.plan} · {fmtNum(billing.tracesLimit)} traces/mo</span>
              <button className="btn btn-sm" onClick={() => router.push("/cost-explorer")}>View costs →</button>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary">Upgrade plan</button>
              <button className="btn">Manage billing</button>
            </div>
          </div>
        </div>
      )}

      {/* Project info */}
      {project && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd"><h3>Project</h3></div>
          <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px", fontSize: 12.5 }}>
            <span className="muted-2">Name</span><span>{project.name}</span>
            <span className="muted-2">Project ID</span><span className="mono">{project.id}</span>
            <span className="muted-2">Created</span><span className="mono">{new Date(project.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      )}

      {/* API keys */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd">
          <h3>API keys</h3>
          <span className="sub mono">{keys.length} active</span>
          <div className="spacer"/>
        </div>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <input className="input grow" placeholder="Key name (e.g. Production server, CI tests)" value={keyName}
                 onChange={e => setKeyName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createKey(); }}/>
          <button className="btn btn-primary" onClick={createKey} disabled={!keyName.trim()}><IconPlus/> Create key</button>
        </div>
        {createdKey && (
          <div style={{ padding: 14, borderBottom: "1px solid var(--border)", background: "var(--accent-soft)", display: "flex", gap: 12, alignItems: "center" }}>
            <IconZap style={{ color: "var(--accent)" }}/>
            <div className="grow col" style={{ gap: 4, minWidth: 0 }}>
              <div className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>Save this key — it won&apos;t be shown again</div>
              <code className="mono" style={{ fontSize: 12, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, overflow: "auto", color: "var(--accent)" }}>{createdKey}</code>
            </div>
            <button className="btn btn-sm" onClick={() => copyKey(createdKey)}><IconCopy/> Copy</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCreatedKey(null)}>Dismiss</button>
          </div>
        )}
        <div>
          {keys.length === 0 && <div style={{ padding: 24, textAlign: "center" }} className="muted">No API keys yet.</div>}
          {keys.map(k => (
            <div key={k.id} className="key-row">
              <div className="col" style={{ gap: 3 }}>
                <span style={{ fontWeight: 500, fontSize: 13 }}>{k.name ?? "Unnamed key"}</span>
                <span className="mono muted-2" style={{ fontSize: 11 }}>{k.keyPrefix}…</span>
              </div>
              <span className="mono muted" style={{ fontSize: 11 }}>used {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "never"}</span>
              <span className="mono muted-2" style={{ fontSize: 11 }}>created {new Date(k.createdAt).toLocaleDateString()}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => revokeKey(k.id)} style={{ color: "var(--error)" }}><IconTrash/> Revoke</button>
            </div>
          ))}
        </div>
      </div>

      {/* Webhooks */}
      <div className="card">
        <div className="hd"><h3>Webhooks</h3><span className="sub mono">cost spikes · errors · completions</span></div>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <input className="input grow" placeholder="https://your-server.com/webhook"
                   value={newWh.url} onChange={e => setNewWh(p => ({ ...p, url: e.target.value }))}
                   style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}/>
            <button className="btn btn-primary" onClick={addWebhook} disabled={!newWh.url.trim()}><IconPlus/> Add</button>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {ALL_EVENTS.map(ev => (
              <label key={ev} className="row" style={{ gap: 5, fontSize: 11.5, cursor: "pointer" }}>
                <input type="checkbox" checked={newWh.events.includes(ev)}
                       onChange={e => setNewWh(p => ({
                         ...p,
                         events: e.target.checked ? [...p.events, ev] : p.events.filter(x => x !== ev),
                       }))}/>
                <span className="mono">{ev.replace(/_/g, " ")}</span>
              </label>
            ))}
          </div>
        </div>
        <div>
          {webhooks.length === 0 && <div style={{ padding: 24, textAlign: "center" }} className="muted">No webhooks yet.</div>}
          {webhooks.map(wh => (
            <div key={wh.id} className="key-row" style={{ alignItems: "flex-start" }}>
              <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</span>
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  {wh.events.map(ev => (
                    <span key={ev} className="chip" style={{ fontSize: 10, padding: "1px 6px" }}>{ev.replace(/_/g, " ")}</span>
                  ))}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => toggleWebhook(wh.id)}>
                {wh.enabled ? <Badge tone="ok"><span className="dot"/>active</Badge> : <Badge>paused</Badge>}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => deleteWebhook(wh.id)} style={{ color: "var(--error)" }}><IconTrash/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
