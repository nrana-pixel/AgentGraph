"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ToolIcon } from "@/components/ui/primitives";
import { IconSearch, IconChev } from "@/components/ui/icons";
import { useBusEvent } from "@/lib/bus";
import { useTweaks } from "@/lib/tweaks";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";
import type { ToolListItem, TraceRow } from "@agentgraph/types";

type Item = { id: string; label: string; hint?: string; group: string; action: () => void; shortcut?: string; icon?: React.ReactNode };

const NAV_ITEMS: [string, string, string, string][] = [
  ["dashboard", "Go to Overview", "/dashboard", "G D"],
  ["traces", "Go to Traces", "/traces", "G T"],
  ["tools", "Go to Tool catalog", "/tools", "G O"],
  ["recommend", "Go to Recommendations", "/recommendations", "G R"],
  ["settings", "Go to Settings", "/settings", "G S"],
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [tools, setTools] = useState<ToolListItem[]>([]);
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasFetched = useRef(false);
  const router = useRouter();
  const [tweaks, setTweak] = useTweaks();
  const { project, token } = useProject();

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

  useEffect(() => {
    if (!open || hasFetched.current || !token || !project) return;
    hasFetched.current = true;
    Promise.all([
      apiGet<{ tools: ToolListItem[] }>("/v1/tools?limit=100", token),
      apiGet<{ traces: TraceRow[] }>(`/v1/traces?projectId=${project.id}&limit=12`, token),
    ]).then(([t, tr]) => { setTools(t.tools); setTraces(tr.traces); })
      .catch((err: Error) => { hasFetched.current = false; console.error("[cmdk] prefetch failed", err); });
  }, [open, token, project]);

  const agents = useMemo(() => [...new Set(traces.map(t => t.agentId))], [traces]);

  const allItems = useMemo((): Item[] => {
    const list: Item[] = [];
    NAV_ITEMS.forEach(([k, label, path, sc]) =>
      list.push({ id: "p:" + k, label, group: "Page", action: () => { router.push(path); setOpen(false); }, shortcut: sc })
    );
    list.push({ id: "a:theme", label: "Toggle theme", group: "Action", action: () => { setTweak("theme", tweaks.theme === "dark" ? "light" : "dark"); setOpen(false); } });
    list.push({ id: "a:density", label: "Cycle density", group: "Action", action: () => { const o = ["compact","regular","cozy"]; setTweak("density", o[(o.indexOf(tweaks.density)+1)%3] as "compact"|"regular"|"cozy"); setOpen(false); } });
    list.push({ id: "a:newkey", label: "Create API key", group: "Action", action: () => { router.push("/settings"); setOpen(false); } });
    tools.forEach(t =>
      list.push({ id: "t:" + t.slug, label: t.name, hint: t.category.replace("_", " "), group: "Tool", action: () => { router.push("/tools/" + t.slug); setOpen(false); }, icon: <ToolIcon slug={t.slug} name={t.name} size={20}/> })
    );
    agents.forEach(a =>
      list.push({ id: "ag:" + a, label: a, hint: "agent", group: "Agent", action: () => { router.push("/traces?agent=" + encodeURIComponent(a)); setOpen(false); } })
    );
    traces.forEach(t =>
      list.push({ id: "tr:" + t.id, label: t.id, hint: t.agentId + " · " + t.status, group: "Trace", action: () => { router.push("/traces/" + t.id); setOpen(false); } })
    );
    return list;
  }, [tools, agents, traces, tweaks.theme, tweaks.density, router, setOpen, setTweak]);

  const items = useMemo(() => {
    const filtered = q.trim()
      ? allItems.filter(it => (it.label + " " + (it.hint ?? "") + " " + it.group).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 30)
      : allItems.slice(0, 24);
    return filtered.map((it, i) => ({ ...it, _i: i }));
  }, [allItems, q]);

  useEffect(() => { if (idx >= items.length) setIdx(0); }, [idx, items.length]);

  // All hooks above — safe to return early below
  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(i => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && items[idx]) { items[idx]!.action(); }
  };

  const groups: Record<string, typeof items> = {};
  items.forEach(it => { (groups[it.group] = groups[it.group] ?? []).push(it); });

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
              {gitems.map(it => (
                <div key={it.id} className="cmdk-item" data-active={it._i === idx ? "true" : undefined}
                     onMouseEnter={() => setIdx(it._i)} onClick={it.action}>
                  <span className="cmdk-icon">{it.icon ?? <IconChev/>}</span>
                  <span className="cmdk-label">{it.label}</span>
                  {it.hint && <span className="cmdk-hint mono">{it.hint}</span>}
                  <span className="spacer"/>
                  {it.shortcut && <span className="kbd" style={{ fontSize: 9.5 }}>{it.shortcut}</span>}
                </div>
              ))}
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
