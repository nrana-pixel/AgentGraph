export function fmtNum(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

export function fmtMoney(s: string | number | null | undefined): string {
  if (s == null) return "—";
  const n = typeof s === "number" ? s : parseFloat(s);
  if (n < 0.01) return "$" + n.toFixed(4);
  if (n < 1) return "$" + n.toFixed(3);
  return "$" + n.toFixed(2);
}

export function fmtMs(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1000) return (n / 1000).toFixed(2) + "s";
  return n + "ms";
}

export function fmtPct(s: string | number | null | undefined): string {
  if (s == null) return "—";
  return (parseFloat(String(s)) * 100).toFixed(2) + "%";
}

export function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return Math.floor(diff) + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}
