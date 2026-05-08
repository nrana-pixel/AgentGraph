"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_KEYS_INITIAL, BILLING, WEBHOOKS_INITIAL } from "@/lib/data";
import { fmtNum } from "@/lib/format";
import { Badge } from "@/components/ui/primitives";
import { IconPlus, IconTrash, IconCopy, IconZap } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

type ApiKey = { id: string; name: string; prefix: string; lastUsed: string; createdAt: string };
type Webhook = { id: string; url: string; events: string[]; enabled: boolean; createdAt: string };

const PLAN_COLORS: Record<string, string> = { free: "info", pro: "violet", team: "ok" };

const ALL_EVENTS = ["cost_spike", "error_rate_threshold", "trace_completed"];

export default function SettingsPage() {
  const router = useRouter();
  const [keys, setKeys] = useState<ApiKey[]>(API_KEYS_INITIAL);
  const [keyName, setKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>(WEBHOOKS_INITIAL);
  const [newWh, setNewWh] = useState({ url: "", events: ["cost_spike"] as string[] });
  const toast = useToast();

  const createKey = () => {
    if (!keyName.trim()) return;
    const raw = "ag_live_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    setCreatedKey(raw);
    setKeys(prev => [{
      id: "k_" + Math.random().toString(36).slice(2, 5),
      name: keyName.trim(),
      prefix: raw.slice(0, 13) + "..." + raw.slice(-4),
      lastUsed: "never",
      createdAt: new Date().toISOString(),
    }, ...prev]);
    setKeyName("");
  };

  const revokeKey = (id: string) => { setKeys(prev => prev.filter(k => k.id !== id)); toast("Key revoked"); };
  const copyKey = (raw: string) => { navigator.clipboard?.writeText?.(raw); toast("Copied to clipboard"); };

  const addWebhook = () => {
    if (!newWh.url.trim() || !newWh.url.startsWith("https://")) {
      toast("URL must start with https://"); return;
    }
    setWebhooks(prev => [{
      id: "wh_" + Math.random().toString(36).slice(2, 6),
      url: newWh.url.trim(),
      events: newWh.events,
      enabled: true,
      createdAt: new Date().toISOString(),
    }, ...prev]);
    setNewWh({ url: "", events: ["cost_spike"] });
    toast("Webhook added");
  };

  const toggleWebhook = (id: string) => setWebhooks(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w));
  const deleteWebhook = (id: string) => { setWebhooks(prev => prev.filter(w => w.id !== id)); toast("Webhook removed"); };

  const usagePct = BILLING.tracesUsed / BILLING.tracesLimit;
  const barColor = usagePct > 0.9 ? "var(--error)" : usagePct > 0.7 ? "var(--warn)" : "var(--success)";

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Settings</h1>
          <div className="sub">Manage API keys, webhooks, and billing.</div>
        </div>
      </div>

      {/* Billing card */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd"><h3>Billing &amp; plan</h3>
          <Badge tone={PLAN_COLORS[BILLING.plan] as "violet" | "ok" | "info"}>{BILLING.plan}</Badge>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="col" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12.5 }}>
              <span className="muted-2">Monthly traces</span>
              <span className="mono tnum">
                {fmtNum(BILLING.tracesUsed)} <span className="muted-2">/ {fmtNum(BILLING.tracesLimit)}</span>
              </span>
            </div>
            <div className="bar" style={{ height: 8 }}>
              <div className="bar-fill" style={{ width: (usagePct * 100) + "%", background: barColor }}/>
            </div>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
              <span>{(usagePct * 100).toFixed(1)}% used · resets {BILLING.periodEnd}</span>
              {usagePct > 0.8 && <span style={{ color: "var(--warn)" }}>approaching limit</span>}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "10px 16px", fontSize: 12 }}>
            <span className="muted-2">Plan</span>
            <span className="mono" style={{ textTransform: "capitalize" }}>{BILLING.plan} · {fmtNum(BILLING.tracesLimit)} traces/mo</span>
            <button className="btn btn-sm" onClick={() => router.push("/cost-explorer")}>View costs →</button>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary">Upgrade plan</button>
            <button className="btn">Manage billing</button>
          </div>
        </div>
      </div>

      {/* Project info */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd"><h3>Project</h3></div>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px", fontSize: 12.5 }}>
          <span className="muted-2">Name</span><span>acme-prod</span>
          <span className="muted-2">Project ID</span><span className="mono">prj_8b2k9z4f</span>
          <span className="muted-2">Created</span><span className="mono">2026-01-08</span>
          <span className="muted-2">Environment</span><span><Badge>prod</Badge></span>
        </div>
      </div>

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
              <div className="mono" style={{ fontWeight: 600, fontSize: 12.5 }}>Save this key — it won't be shown again</div>
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
                <span style={{ fontWeight: 500, fontSize: 13 }}>{k.name}</span>
                <span className="mono muted-2" style={{ fontSize: 11 }}>{k.prefix}</span>
              </div>
              <span className="mono muted" style={{ fontSize: 11 }}>used {k.lastUsed}</span>
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
