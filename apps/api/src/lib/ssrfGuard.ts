import { isIP } from "net";
import { lookup } from "dns/promises";

/**
 * SSRF guard for attacker-supplied webhook URLs. Mirrors the worker copy in
 * apps/worker/src/lib/ssrfGuard.ts (kept in sync the same way modelCosts is) —
 * the API runs it at creation time for fast feedback, the worker re-runs it at
 * delivery time, which is the authoritative egress boundary.
 */
export async function assertPublicWebhookUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("malformed webhook url");
  }

  if (url.protocol !== "https:") {
    throw new Error(`webhook url must use https (got ${url.protocol})`);
  }

  const host = url.hostname;

  if (isIP(host) !== 0) {
    assertPublicAddress(host);
    return;
  }

  const records = await lookup(host, { all: true });
  if (records.length === 0) {
    throw new Error(`webhook host did not resolve: ${host}`);
  }
  for (const { address } of records) {
    assertPublicAddress(address);
  }
}

function assertPublicAddress(addr: string): void {
  if (!isPublicAddress(addr)) {
    throw new Error(`webhook target resolves to a non-public address: ${addr}`);
  }
}

/** True only for globally routable unicast addresses. */
export function isPublicAddress(addr: string): boolean {
  const kind = isIP(addr);
  if (kind === 4) return isPublicIPv4(addr);
  if (kind === 6) return isPublicIPv6(addr);
  return false;
}

function isPublicIPv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return false;
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return false; // 0.0.0.0/8 "this network"
  if (a === 10) return false; // private
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local incl. 169.254.169.254 cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10 CGNAT
  if (a >= 224) return false; // multicast + reserved
  return true;
}

function isPublicIPv6(addr: string): boolean {
  const a = addr.toLowerCase();

  const mapped = a.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPublicIPv4(mapped[1]);

  if (a === "::" || a === "::1") return false; // unspecified / loopback
  if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) {
    return false; // fe80::/10 link-local
  }
  if (a.startsWith("fc") || a.startsWith("fd")) return false; // fc00::/7 unique-local
  if (a.startsWith("ff")) return false; // ff00::/8 multicast
  return true;
}
