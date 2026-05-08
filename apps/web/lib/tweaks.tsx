"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Tweaks = {
  theme: "dark" | "light";
  density: "compact" | "regular" | "cozy";
  sidebar: "full" | "collapsed" | "hidden";
  font: "geist" | "ibm" | "space" | "mono";
  accent: "amber" | "cyan" | "violet" | "green";
  vizStyle: "bars" | "flame" | "timeline";
  recCard: "ranked" | "compact" | "galaxy";
};

export const TWEAK_DEFAULTS: Tweaks = {
  theme: "dark",
  density: "regular",
  sidebar: "full",
  font: "geist",
  accent: "amber",
  vizStyle: "bars",
  recCard: "ranked",
};

export const ACCENT_PALETTES: Record<string, { dark: string; light: string; fg_d: string; fg_l: string }> = {
  amber:  { dark: "oklch(0.78 0.16 70)",  light: "oklch(0.62 0.16 60)",  fg_d: "#1a1208", fg_l: "#ffffff" },
  cyan:   { dark: "oklch(0.78 0.14 200)", light: "oklch(0.55 0.14 200)", fg_d: "#04181c", fg_l: "#ffffff" },
  violet: { dark: "oklch(0.72 0.18 295)", light: "oklch(0.52 0.18 295)", fg_d: "#1a0a2a", fg_l: "#ffffff" },
  green:  { dark: "oklch(0.74 0.16 150)", light: "oklch(0.50 0.16 150)", fg_d: "#04200f", fg_l: "#ffffff" },
};

type TweaksCtx = [Tweaks, (key: keyof Tweaks, value: string) => void];
const TweaksContext = createContext<TweaksCtx>([TWEAK_DEFAULTS, () => {}]);

function loadTweaks(): Tweaks {
  if (typeof window === "undefined") return TWEAK_DEFAULTS;
  try {
    const stored = localStorage.getItem("ag_tweaks");
    if (stored) return { ...TWEAK_DEFAULTS, ...JSON.parse(stored) };
  } catch {}
  return TWEAK_DEFAULTS;
}

export function TweaksProvider({ children }: { children: React.ReactNode }) {
  const [tweaks, setTweaks] = useState<Tweaks>(TWEAK_DEFAULTS);

  useEffect(() => {
    setTweaks(loadTweaks());
  }, []);

  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute("data-theme", tweaks.theme);
    el.setAttribute("data-density", tweaks.density);
    el.setAttribute("data-sidebar", tweaks.sidebar);
    el.setAttribute("data-font", tweaks.font);
    const pal = ACCENT_PALETTES[tweaks.accent] ?? ACCENT_PALETTES["amber"] ?? { dark: "oklch(75% 0.18 60)", light: "oklch(60% 0.18 60)", fg_d: "#000", fg_l: "#fff" };
    const accent = tweaks.theme === "dark" ? pal.dark : pal.light;
    const fg = tweaks.theme === "dark" ? pal.fg_d : pal.fg_l;
    el.style.setProperty("--accent", accent);
    el.style.setProperty("--accent-fg", fg);
    el.style.setProperty("--accent-soft", accent.replace("oklch(", "oklch(").replace(")", " / 0.14)"));
    try { localStorage.setItem("ag_tweaks", JSON.stringify(tweaks)); } catch {}
  }, [tweaks]);

  const setTweak = useCallback((key: keyof Tweaks, value: string) => {
    setTweaks(prev => ({ ...prev, [key]: value }));
  }, []);

  return <TweaksContext.Provider value={[tweaks, setTweak]}>{children}</TweaksContext.Provider>;
}

export function useTweaks(): TweaksCtx {
  return useContext(TweaksContext);
}
