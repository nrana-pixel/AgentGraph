"use client";

type LogoProps = { size?: number; className?: string };

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AgentGraph"
    >
      <line x1="7" y1="17" x2="17" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="7" cy="17" r="4" fill="currentColor" />
      <circle cx="17" cy="7" r="4" fill="#4F46E5" />
    </svg>
  );
}
