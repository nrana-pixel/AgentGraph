"use client";
import { useState } from "react";
import { API_KEYS_INITIAL } from "@/lib/data";
import { Badge } from "@/components/ui/primitives";
import { IconPlus, IconTrash, IconCopy, IconZap } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";

type ApiKey = { id: string; name: string; prefix: string; lastUsed: string; createdAt: string };

export default function SettingsPage() {
  const [keys, setKeys] = useState<ApiKey[]>(API_KEYS_INITIAL);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const toast = useToast();

  const create = () => {
    if (!name.trim()) return;
    const id = "k_" + Math.random().toString(36).slice(2, 5);
    const raw = "ag_live_" + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
    setCreatedKey(raw);
    setKeys(prev => [{ id, name: name.trim(), prefix: raw.slice(0, 13) + "..." + raw.slice(-4), lastUsed: "never", createdAt: new Date().toISOString() }, ...prev]);
    setName("");
  };

  const revoke = (id: string) => {
    setKeys(prev => prev.filter(k => k.id !== id));
    toast("Key revoked");
  };

  const copyKey = (raw: string) => {
    navigator.clipboard?.writeText?.(raw);
    toast("Copied to clipboard");
  };

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <h1>Settings</h1>
          <div className="sub">Manage API keys, environments, and project preferences.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd"><h3>Project</h3></div>
        <div style={{ padding: "12px 16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px", fontSize: 12.5 }}>
          <span className="muted-2">Name</span><span>acme-prod</span>
          <span className="muted-2">Project ID</span><span className="mono">prj_8b2k9z4f</span>
          <span className="muted-2">Created</span><span className="mono">2026-01-08</span>
          <span className="muted-2">Plan</span><span><Badge tone="violet">Scale</Badge> <span className="mono muted-2" style={{ fontSize: 11 }}>1M traces / mo</span></span>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <h3>API keys</h3>
          <span className="sub mono">{keys.length} active</span>
          <div className="spacer"/>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
          <input className="input grow" placeholder="Key name (e.g. Production server, CI tests)" value={name}
                 onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") create(); }}/>
          <button className="btn btn-primary" onClick={create} disabled={!name.trim()}><IconPlus/> Create key</button>
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
              <button className="btn btn-ghost btn-sm" onClick={() => revoke(k.id)} style={{ color: "var(--error)" }}><IconTrash/> Revoke</button>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="hd"><h3>Webhooks</h3><span className="sub mono">stream traces & errors</span></div>
        <div style={{ padding: 16, display: "flex", gap: 12, alignItems: "center" }}>
          <input className="input grow" defaultValue="https://api.acme.dev/agentgraph/ingest" style={{ fontFamily: "var(--font-mono)" }}/>
          <Badge tone="ok"><span className="dot"/>active</Badge>
          <button className="btn">Test</button>
        </div>
      </div>
    </div>
  );
}
