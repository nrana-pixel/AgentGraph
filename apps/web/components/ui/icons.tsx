"use client";
import type { SVGProps } from "react";

type IconProps = { size?: number; className?: string; style?: React.CSSProperties };

function mkIcon(d: string, sw = 1.5, fill = "none", sz = 14) {
  return function Icon({ size, className, style }: IconProps) {
    const s = size ?? sz;
    const stroke = fill === "currentColor" ? "none" : "currentColor";
    return (
      <svg viewBox="0 0 16 16" width={s} height={s} fill={fill} stroke={stroke}
           strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}
           dangerouslySetInnerHTML={{ __html: d }}/>
    );
  };
}

export const IconDashboard = mkIcon('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>', 1.4, "none", 16);
export const IconTrace     = mkIcon('<path d="M2 4h7M2 8h11M2 12h5"/><circle cx="11" cy="4" r="1.4"/><circle cx="14" cy="8" r="1.4"/><circle cx="7" cy="12" r="1.4"/>', 1.4, "none", 16);
export const IconTools     = mkIcon('<path d="M3 2h3v3H3zM10 2h3v3h-3zM3 9h3v3H3zM10 9h3v3h-3z"/><path d="M6 3.5h4M6 10.5h4M4.5 5v4M11.5 5v4"/>', 1.4, "none", 16);
export const IconRec       = mkIcon('<path d="M8 1.5l1.8 4.1 4.5.4-3.4 3 1 4.4L8 11.2 4.1 13.4l1-4.4-3.4-3 4.5-.4z"/>', 1.4, "none", 16);
export const IconSettings  = mkIcon('<circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M14 8h-2M4 8H2M12.2 3.8l-1.4 1.4M5.2 10.8l-1.4 1.4M12.2 12.2l-1.4-1.4M5.2 5.2l-1.4-1.4"/>', 1.4, "none", 16);
export const IconSearch    = mkIcon('<circle cx="7" cy="7" r="4.5"/><path d="m13 13-2.5-2.5"/>', 1.6);
export const IconPlus      = mkIcon('<path d="M8 3v10M3 8h10"/>', 1.6);
export const IconCopy      = mkIcon('<rect x="5" y="5" width="8" height="8" rx="1.2"/><path d="M3 11V3.5A.5.5 0 0 1 3.5 3H11"/>', 1.4, "none", 13);
export const IconExt       = mkIcon('<path d="M6 3H3v10h10V10"/><path d="M9 3h4v4M13 3 7 9"/>', 1.4, "none", 11);
export const IconChev      = mkIcon('<path d="m6 4 4 4-4 4"/>', 1.6, "none", 12);
export const IconChevDown  = mkIcon('<path d="m4 6 4 4 4-4"/>', 1.6, "none", 11);
export const IconFilter    = mkIcon('<path d="M2 3h12l-4.5 5.5V13L6.5 11V8.5z"/>', 1.5, "none", 13);
export const IconSun       = mkIcon('<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.8 2.8l1.1 1.1M12.1 12.1l1.1 1.1M2.8 13.2l1.1-1.1M12.1 3.9l1.1-1.1"/>', 1.5);
export const IconMoon      = mkIcon('<path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z"/>', 1.5);
export const IconPanelL    = mkIcon('<rect x="2" y="3" width="12" height="10" rx="1.4"/><path d="M6 3v10"/>', 1.5);
export const IconTrash     = mkIcon('<path d="M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4l.7 9a1 1 0 0 0 1 .9h2.6a1 1 0 0 0 1-.9L11 4"/>', 1.5, "none", 13);
export const IconCheck     = mkIcon('<path d="m3 8 3.5 3.5L13 5"/>', 1.8, "none", 12);
export const IconZap       = mkIcon('<path d="M9 1 3 9h4l-1 6 6-8H8z"/>', 1.4, "none", 13);
export const IconGithub    = mkIcon('<path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.1.5-.2.5-.4v-1.5c-2.2.5-2.7-1-2.7-1-.4-.9-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8 0 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.6-.9-3.6-3.9 0-.9.3-1.6.8-2.2-.1-.2-.4-1 .1-2 0 0 .7-.2 2.2.8a7.6 7.6 0 0 1 4 0c1.5-1 2.2-.8 2.2-.8.4 1 .2 1.8.1 2 .5.6.8 1.3.8 2.2 0 3-1.8 3.7-3.6 3.9.3.3.5.8.5 1.5v2.2c0 .2.1.5.6.4A8 8 0 0 0 8 .2z"/>', 1.4, "currentColor", 13);
export const IconGlobe     = mkIcon('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2.5 2 9 0 12M8 2c-2 2.5-2 9 0 12"/>', 1.4, "none", 13);
export const IconBook      = mkIcon('<path d="M2 3a1 1 0 0 1 1-1h4v11H3a1 1 0 0 1-1-1V3zM14 3a1 1 0 0 0-1-1H9v11h4a1 1 0 0 0 1-1V3z"/>', 1.4, "none", 13);
