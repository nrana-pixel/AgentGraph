"use client";
import { useState } from "react";
import { useTweaks, ACCENT_PALETTES } from "@/lib/tweaks";
import type { Tweaks } from "@/lib/tweaks";

export function TweaksPanel() {
  const [open, setOpen] = useState(false);
  const [tweaks, setTweak] = useTweaks();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Tweaks"
              style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1000, width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border-2)", background: "var(--panel)", color: "var(--text-2)", fontSize: 14, cursor: "default", display: "flex", alignItems: "center", justifyContent: "center" }}>
        ⊙
      </button>
    );
  }

  return (
    <div style={{ position: "fixed", right: 16, bottom: 16, zIndex: 1000, width: 280, background: "var(--panel)", border: "1px solid var(--border-2)", borderRadius: 12, boxShadow: "var(--shadow-lg)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Tweaks</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "default", fontSize: 14, padding: "0 4px" }}>✕</button>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
        <Section label="Appearance"/>
        <Radio label="Theme" value={tweaks.theme} options={["dark","light"]} onChange={v => setTweak("theme", v)}/>
        <AccentRow value={tweaks.accent} onChange={v => setTweak("accent", v)}/>
        <Select label="Font" value={tweaks.font} options={["geist","ibm","space","mono"]} onChange={v => setTweak("font", v)}/>
        <Radio label="Density" value={tweaks.density} options={["compact","regular","cozy"]} onChange={v => setTweak("density", v)}/>
        <Select label="Sidebar" value={tweaks.sidebar} options={["full","collapsed","hidden"]} onChange={v => setTweak("sidebar", v)}/>
        <Section label="Trace viz"/>
        <Radio label="Default style" value={tweaks.vizStyle} options={["bars","flame","timeline"]} onChange={v => setTweak("vizStyle", v)}/>
        <Section label="Recommendations"/>
        <Radio label="Card style" value={tweaks.recCard} options={["ranked","compact","galaxy"]} onChange={v => setTweak("recCard", v)}/>
      </div>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-3)", paddingTop: 4 }}>{label}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11.5, color: "var(--text-2)" }}>{label}</span>
      {children}
    </div>
  );
}

function Radio({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <div style={{ display: "flex", background: "var(--panel-hi)", borderRadius: 6, padding: 2 }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} style={{ flex: 1, padding: "3px 6px", borderRadius: 4, border: "none", fontSize: 11, fontWeight: 500, cursor: "default", background: value === o ? "var(--bg-2)" : "transparent", color: value === o ? "var(--text)" : "var(--text-3)", boxShadow: value === o ? "var(--shadow)" : "none", transition: "all 120ms" }}>
            {o}
          </button>
        ))}
      </div>
    </Row>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <Row label={label}>
      <select value={value} onChange={e => onChange(e.target.value)} className="select" style={{ width: "100%" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </Row>
  );
}

function AccentRow({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Row label="Accent">
      <div style={{ display: "flex", gap: 6 }}>
        {Object.entries(ACCENT_PALETTES).map(([k, pal]) => (
          <button key={k} onClick={() => onChange(k)} title={k} style={{ width: 22, height: 22, borderRadius: "50%", background: pal.dark, border: value === k ? "2px solid var(--text)" : "2px solid var(--border-2)", padding: 0, cursor: "default", boxShadow: value === k ? `0 0 0 2px var(--bg), 0 0 0 4px ${pal.dark}` : "none", transition: "all 140ms" }}/>
        ))}
      </div>
    </Row>
  );
}
