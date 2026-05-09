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
          <Link
            key={r.id}
            href={r.path}
            className={`nav-item${activeId === r.id ? " active" : ""}`}
          >
            <r.Icon/>
            <span>{r.label}</span>
            {r.count !== null && <span className="nav-badge">{r.count}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  );
}