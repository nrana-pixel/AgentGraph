"use client";
import { useMemo, useState } from "react";

export function Badge({ tone, children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span className="badge" data-tone={tone ?? ""}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  if (status === "running")
    return (
      <Badge tone="warn">
        <span className="dot" /> running
      </Badge>
    );
  if (status === "error")
    return (
      <Badge tone="err">
        <span className="dot" /> error
      </Badge>
    );
  return (
    <Badge tone="ok">
      <span className="dot" /> completed
    </Badge>
  );
}

export function EnvBadge({ env }: { env: string }) {
  if (env === "prod") return <Badge tone="violet">prod</Badge>;
  if (env === "staging") return <Badge tone="info">staging</Badge>;
  return <Badge>dev</Badge>;
}

export function Sparkline({
  values,
  color,
  height = 38,
  fill = true,
}: {
  values: number[];
  color?: string;
  height?: number;
  fill?: boolean;
}) {
  const safe = values?.filter(Number.isFinite) ?? [];
  if (safe.length === 0) return null;
  const max = Math.max(...safe);
  const min = Math.min(...safe);
  const range = max - min || 1;
  const w = 100,
    h = 100;
  const pts = safe.map((v, i) => {
    const x = safe.length > 1 ? (i / (safe.length - 1)) * w : w / 2;
    const y = h - ((v - min) / range) * h * 0.85 - 6;
    return [x, y] as [number, number];
  });
  const path = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(" ");
  const area = path + ` L${w},${h} L0,${h} Z`;
  const c = color ?? "var(--accent)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {fill && <path d={area} fill={c} opacity="0.12" />}
      <path d={path} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function JsonView({ value, max = 320 }: { value: unknown; max?: number }) {
  const text = useMemo(() => {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return JSON.stringify(parsed, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  const html = useMemo(() => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/("(?:\\.|[^"\\])*")(\s*:)?/g, (_, str, colon) =>
        colon
          ? `<span class="code-key">${str}</span>${colon}`
          : `<span class="code-str">${str}</span>`,
      )
      .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="code-num">$1</span>')
      .replace(/\b(true|false)\b/g, '<span class="code-bool">$1</span>')
      .replace(/\bnull\b/g, '<span class="code-null">null</span>');
  }, [text]);
  return (
    <pre
      className="code-block"
      style={{ maxHeight: max }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function ScoreBar({
  value,
  max = 100,
  color,
}: {
  value: number;
  max?: number;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar">
      <div
        className="bar-fill"
        style={{ width: pct + "%", background: color ?? "var(--accent)" }}
      />
    </div>
  );
}

export function Ring({
  value,
  max = 100,
  size = 56,
  stroke = 5,
  color,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(1, value / max)));
  return (
    <svg className="ring" width={size} height={size}>
      <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
      <circle
        className="ring-fg"
        cx={size / 2}
        cy={size / 2}
        r={r}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ stroke: color ?? "var(--accent)" }}
      />
    </svg>
  );
}

const PALETTES = [
  "var(--accent)",
  "var(--info)",
  "var(--violet)",
  "var(--success)",
  "var(--error)",
];

function faviconUrl(website: string | null | undefined, size: number): string | null {
  if (!website) return null;
  try {
    const host = new URL(website).hostname;
    const px = Math.max(32, Math.min(128, Math.round(size * 2)));
    return `https://www.google.com/s2/favicons?domain=${host}&sz=${px}`;
  } catch {
    return null;
  }
}

export function ToolIcon({
  slug,
  name,
  size = 36,
  website,
}: {
  slug: string;
  name: string;
  size?: number;
  website?: string | null;
}) {
  const ch = (name || slug || "?").slice(0, 1).toUpperCase();
  const idx = (slug || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTES.length;
  const color = PALETTES[idx];
  const src = faviconUrl(website, size);
  const [failed, setFailed] = useState(false);
  const showImg = src && !failed;
  return (
    <div
      className="tool-icon"
      style={{
        width: size,
        height: size,
        color,
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, var(--panel-2))`,
        overflow: "hidden",
      }}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          width={Math.round(size * 0.66)}
          height={Math.round(size * 0.66)}
          onError={() => setFailed(true)}
          style={{ display: "block" }}
        />
      ) : (
        ch
      )}
    </div>
  );
}

export function Skeleton({
  w = "100%",
  h = 16,
  rounded = 6,
  style,
}: {
  w?: string | number;
  h?: number;
  rounded?: number;
  style?: React.CSSProperties;
}) {
  return <div className="skel" style={{ width: w, height: h, borderRadius: rounded, ...style }} />;
}

export function EmptyState({
  title,
  sub,
  icon,
  action,
}: {
  title: string;
  sub?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state fade-up">
      <div className="empty-icon">{icon ?? "○"}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
      {action}
    </div>
  );
}
