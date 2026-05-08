"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconPanelL, IconSearch } from "@/components/ui/icons";
import { useTweaks } from "@/lib/tweaks";
import { useBus } from "@/lib/bus";

export function Topbar() {
  const pathname = usePathname();
  const [tweaks, setTweak] = useTweaks();
  const { emit } = useBus();

  const crumbs = (() => {
    if (pathname === "/dashboard") return [{ here: true, label: "Overview" }];
    if (pathname === "/traces") return [{ here: true, label: "Traces" }];
    if (pathname.startsWith("/traces/")) return [{ label: "Traces", path: "/traces" }, { here: true, label: pathname.split("/")[2] }];
    if (pathname === "/tools") return [{ here: true, label: "Tool catalog" }];
    if (pathname.startsWith("/tools/")) return [{ label: "Tool catalog", path: "/tools" }, { here: true, label: pathname.split("/")[2] }];
    if (pathname === "/recommendations") return [{ here: true, label: "Recommendations" }];
    if (pathname === "/settings") return [{ here: true, label: "Settings" }];
    return [] as { here?: boolean; label: string; path?: string }[];
  })();

  const toggleSidebar = () => {
    const cur = tweaks.sidebar;
    setTweak("sidebar", cur === "full" ? "collapsed" : cur === "collapsed" ? "hidden" : "full");
  };

  return (
    <div className="topbar">
      <button className="btn btn-ghost btn-icon" onClick={toggleSidebar} title="Toggle sidebar">
        <IconPanelL/>
      </button>
      <div className="crumb">
        <span className="mono" style={{ color: "var(--text-3)" }}>acme</span>
        <span className="sep">/</span>
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="sep">/</span>}
            {c.path
              ? <Link href={c.path} className={c.here ? "here" : ""}>{c.label}</Link>
              : <span className={c.here ? "here" : ""}>{c.label}</span>
            }
          </span>
        ))}
      </div>
      <div className="spacer"/>
      <div className="kbar" onClick={() => emit("openPalette")} style={{ cursor: "default" }}>
        <IconSearch/>
        <input placeholder="Search traces, tools, agents..." readOnly style={{ pointerEvents: "none", background: "transparent" }}/>
        <span className="kbd">⌘K</span>
      </div>
      <div className="row" style={{ gap: 4 }}>
        <span className="badge" style={{ background: "var(--success-soft)", color: "var(--success)", borderColor: "color-mix(in srgb, var(--success) 38%, transparent)" }}>
          <span className="pulse-dot"/> live
        </span>
      </div>
    </div>
  );
}
