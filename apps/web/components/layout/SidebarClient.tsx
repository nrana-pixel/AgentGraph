"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDashboard, IconTrace, IconTools, IconRec, IconSettings, IconBook, IconCost } from "@/components/ui/icons";

const ROUTES = [
  { id: "dashboard",    path: "/dashboard",    label: "Overview",     Icon: IconDashboard, count: null },
  { id: "traces",       path: "/traces",       label: "Traces",       Icon: IconTrace,     count: 64   },
  { id: "tools",        path: "/tools",        label: "Tool catalog", Icon: IconTools,     count: 30   },
  { id: "recommendations", path: "/recommendations", label: "Recommend", Icon: IconRec,  count: null },
  { id: "cost-explorer", path: "/cost-explorer", label: "Cost explorer", Icon: IconCost, count: null },
  { id: "settings",    path: "/settings",    label: "Settings",       Icon: IconSettings,  count: null },
];

export function Sidebar() {
  const pathname = usePathname();
  const activeId = (() => {
    if (pathname.startsWith("/traces")) return "traces";
    if (pathname.startsWith("/tools")) return "tools";
    if (pathname.startsWith("/recommend")) return "recommendations";
    if (pathname.startsWith("/cost-explorer")) return "cost-explorer";
    if (pathname.startsWith("/settings")) return "settings";
    return "dashboard";
  })();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">A</div>
        <div className="col" style={{ gap: 0 }}>
          <span className="brand-name">AgentGraph</span>
          <span className="brand-tag">v0.4 · acme-prod</span>
        </div>
      </div>
      <nav className="nav">
        <div className="nav-section">Workspace</div>
        {ROUTES.map(r => (
          <Link key={r.id} href={r.path} className="nav-item" data-active={activeId === r.id ? "true" : undefined} title={r.label}>
            <r.Icon className="nav-icon"/>
            <span>{r.label}</span>
            {r.count != null && <span className="nav-count mono">{r.count}</span>}
          </Link>
        ))}
        <div className="nav-section">Resources</div>
        <a className="nav-item" title="Docs">
          <IconBook className="nav-icon"/><span>Docs</span>
        </a>
        <a className="nav-item" title="Status">
          <svg className="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M2 8h3l2-5 2 10 2-5h3"/></svg>
          <span>Status</span>
          <span className="nav-count" style={{ color: "var(--success)", borderColor: "color-mix(in srgb, var(--success) 32%, transparent)" }}>● ok</span>
        </a>
      </nav>
      <div className="sb-foot">
        <div className="avatar">N</div>
        <div className="sb-foot-content col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>Nadia Pérez</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--text-3)" }}>nadia@acme.dev</span>
        </div>
      </div>
    </aside>
  );
}
