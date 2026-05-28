import https from "https";
import { lookup as dnsLookup } from "dns";
import type { LookupFunction } from "net";
import { isPublicAddress } from "./ssrfGuard.js";

/**
 * DNS lookup that rejects non-public addresses at connection time. Because the
 * socket layer calls this when it actually opens the connection (not earlier),
 * it closes the resolve→connect DNS-rebinding window that a pre-flight check
 * alone leaves open: a host that answered "public" to an earlier check but
 * "private" at connect time is still refused.
 */
const safeLookup = ((hostname, options, callback) => {
  // Force all=true so we validate every returned address, then hand the
  // socket a single address it can use.
  dnsLookup(hostname, { ...(options as object), all: true }, (err, addresses) => {
    if (err) {
      (callback as (e: NodeJS.ErrnoException | null) => void)(err);
      return;
    }
    for (const a of addresses) {
      if (!isPublicAddress(a.address)) {
        (callback as (e: Error) => void)(
          new Error(`blocked webhook target resolving to non-public address: ${a.address}`),
        );
        return;
      }
    }
    const first = addresses[0]!;
    callback(null, first.address, first.family);
  });
}) as LookupFunction;

export interface WebhookResult {
  status: number;
}

/**
 * POST a signed webhook over https with SSRF-safe DNS resolution and a hard
 * timeout. Rejects on transport error, timeout, or a blocked address.
 */
export function deliverWebhook(
  url: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<WebhookResult> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      { method: "POST", headers, lookup: safeLookup, timeout: timeoutMs },
      (res) => {
        res.on("data", () => {}); // drain so the socket can close
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("webhook request timed out")));
    req.write(body);
    req.end();
  });
}
