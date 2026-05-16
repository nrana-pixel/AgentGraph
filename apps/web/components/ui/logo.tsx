"use client";

type LogoProps = {
  size?: number;
  className?: string;
  accent?: string;
};

const ACCENT = "#3B43F5";

// Edge Atom mark — 64×64 grid, -45° edge, "top" node carries the accent.
// Ink uses currentColor so the mark adapts to light/dark themes.
export function Logo({ size = 28, className, accent = ACCENT }: LogoProps) {
  const boost = size <= 16 ? 1.5 : size <= 24 ? 1.3 : size <= 32 ? 1.15 : 1;
  const edgeWeight = 5 * boost;
  const nodeRadius = 9 * boost;

  const angle = -45;
  const r = 14;
  const rad = (angle * Math.PI) / 180;
  const x1 = 32 + r * Math.cos(rad);
  const y1 = 32 + r * Math.sin(rad);
  const x2 = 32 - r * Math.cos(rad);
  const y2 = 32 - r * Math.sin(rad);
  const topIsFirst = y1 <= y2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "block" }}
      aria-label="AgentGraph"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="currentColor"
        strokeWidth={edgeWeight}
        strokeLinecap="round"
      />
      <circle cx={x1} cy={y1} r={nodeRadius} fill={topIsFirst ? accent : "currentColor"} />
      <circle cx={x2} cy={y2} r={nodeRadius} fill={topIsFirst ? "currentColor" : accent} />
    </svg>
  );
}
