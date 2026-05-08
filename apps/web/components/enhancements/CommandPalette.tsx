"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TOOLS_DATA, TRACES_DATA, AGENTS } from "@/lib/data";
import { ToolIcon } from "@/components/ui/primitives";
import { IconSearch, IconChev } from "@/components/ui/icons";
import { useBusEvent, bus } from "@/lib/bus";
import { useTweaks } from "@/lib/tweaks";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [tweaks, setTweak] = useTweaks();

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(o => !o); setQ(""); setIdx(0); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useBusEvent("openPalette", () => { setOpen(true); setQ(""); setIdx(0); });

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const items = useMemo(() => {
    if (!open) return [];
    const list: { id: string; label: string; hint?: string; group: string; action: () => void; shortcut?: string; icon?: React.ReactNode }[] = [];

    [
      ["dashboard", "Go to Overview", "/dashboard", "G D"],
      ["traces", "Go to Traces", "/traces", "G T"],
      ["tools", "Go to Tool catalog", "/tools", "G O"],
      ["recommend", "Go to Recommendations", "/recommendations", "G R"],
      ["settings", "Go to Settings", "/settings", "G S"],
    ].forEach(([k, label, path, sc]) =>
      list.push({ id: "p:" + k, label, group: "Page", action: () => { router.push(path); setOpen(false); }, shortcut: sc })
    );

    list.push({ id: "a:theme", label: "Toggle theme", group: "Action", action: () => { setTweak("theme", tweaks.theme === "dark" ? "light" : "dark"); setOpen(false); } });
    list.push({ id: "a:density", label: "Cycle density", group: "Action", action: () => { const o = ["compact","regular","cozy"]; setTweak("density", o[(o.indexOf(tweaks.density)+1)%3] as "compact"|"regular"|"cozy"); setOpen(false); } });
    list.push({ id: "a:newkey", label: "Create API key", group: "Action", action: () => { router.push("/settings"); setOpen(false); } });

    TOOLS_DATA.forEach(t =>
      list.push({ id: "t:" + t.slug, label: t.name, hint: t.category.replace("_", " "), group: "Tool", action: () => { router.push("/tools/" + t.slug); setOpen(false); }, icon: <ToolIcon slug={t.slug} name={t.name} size={20}/> })
    );

    AGENTS.forEach(a =>
      list.push({ id: "ag:" + a, label: a, hint: "agent", group: "Agent", action: () => { router.push("/traces?agent=" + encodeURIComponent(a)); setOpen(false); } })
    );

    TRACES_DATA.slice(0, 12).forEach(t =>
      list.push({ id: "tr:" + t.id, label: t.id, hint: t.agentId + " · " + t.status, group: "Trace", action: () => { router.push("/traces/" + t.id); setOpen(false); } })
    );

    if (!q.trim()) return list.slice(0, 24);
    const Q = q.trim().toLowerCase();
    return list.filter(it => (it.label + " " + (it.hint ?? "") + " " + it.group).toLowerCase().includes(Q)).slice(0, 30);
  }, [open, q, tweaks.theme, tweaks.density]);

  useEffect(() => { if (idx >= items.length) setIdx(0); }, [items.length]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && items[idx]) { items[idx].action(); }
  };

  if (!open) return null;

  const groups: Record<string, typeof items> = {};
  items.forEach((it, i) => { (groups[it.group] = groups[it.group] ?? []).push({ ...it, _i: i } as typeof it & { _i: number }); });

  return (
    <div className="cmdk-overlay" onClick={() => setOpen(false)}>
      <div className="cmdk-panel" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input">
          <IconSearch/>
          <input ref={inputRef} placeholder="Type a command, page, tool, or trace ID…" value={q}
                 onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey}/>
          <span className="kbd">esc</span>
        </div>
        <div className="cmdk-list">
          {items.length === 0 && <div className="cmdk-empty">No results for <span className="mono">{q}</span></div>}
          {Object.entries(groups).map(([g, gitems]) => (
            <div key={g}>
              <div className="cmdk-group">{g}</div>
              {gitems.map((it) => {
                const _it = it as typeof it & { _i: number };
                return (
                  <div key={it.id} className="cmdk-item" data-active={_it._i === idx ? "true" : undefined}
                       onMouseEnter={() => setIdx(_it._i)} onClick={it.action}>
                    <span className="cmdk-icon">{it.icon ?? <IconChev/>}</span>
                    <span className="cmdk-label">{it.label}</span>
                    {it.hint && <span className="cmdk-hint mono">{it.hint}</span>}
                    <span className="spacer"/>
                    {it.shortcut && <span className="kbd" style={{ fontSize: 9.5 }}>{it.shortcut}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><span className="kbd">↑↓</span> navigate</span>
          <span><span className="kbd">↵</span> select</span>
          <span><span className="kbd">esc</span> close</span>
          <span className="spacer"/>
          <span className="mono muted-2" style={{ fontSize: 10 }}>AgentGraph · cmd center</span>
        </div>
      </div>
    </div>
  );
}
