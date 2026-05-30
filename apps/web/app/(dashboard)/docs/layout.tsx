import Link from "next/link";

const DOC_NAV = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/quickstart", label: "Quickstart" },
  { href: "/docs/concepts", label: "Concepts" },
  { href: "/docs/auto-instrumentation", label: "Auto-instrumentation" },
  { href: "/docs/tool-search", label: "Tool search backend" },
  { href: "/docs/api-reference", label: "API reference" },
  { href: "/docs/troubleshooting", label: "Troubleshooting" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="docs-shell">
      <aside className="docs-nav">
        <div className="docs-nav-title mono">SDK DOCS</div>
        {DOC_NAV.map((item) => (
          <Link key={item.href} href={item.href} className="docs-nav-item">
            {item.label}
          </Link>
        ))}
      </aside>
      <div className="docs-content docs-prose">{children}</div>
    </div>
  );
}
