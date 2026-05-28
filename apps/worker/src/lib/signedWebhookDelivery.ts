import { createHmac } from "crypto";
import { eq, and } from "drizzle-orm";
import type { Drizzle } from "../types.js";
import { webhooks } from "../db/schema.js";
import { assertPublicWebhookUrl } from "./ssrfGuard.js";
import { deliverWebhook } from "./webhookDelivery.js";
import { decryptSecret } from "./secretCrypto.js";

const DELIVERY_TIMEOUT_MS = 5000;

/**
 * Sign and POST a webhook payload to every enabled webhook on a project that
 * is subscribed to `event`. Shared by cost-spike and daily-digest delivery.
 *
 * Each target's secret is decrypted, the JSON body is HMAC-SHA256 signed, and
 * delivery goes through the SSRF-safe `deliverWebhook`. Failures are logged,
 * never thrown — one bad target can't block the others.
 */
export async function deliverSignedWebhooks(
  db: Drizzle,
  projectId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const targets = await db
    .select({ url: webhooks.url, secret: webhooks.secret, events: webhooks.events })
    .from(webhooks)
    .where(and(eq(webhooks.projectId, projectId), eq(webhooks.enabled, true)));

  const eligible = targets.filter((t) => t.events?.includes(event));
  if (eligible.length === 0) return;

  const body = JSON.stringify(payload);

  const results = await Promise.allSettled(
    eligible.map(async (target) => {
      // SSRF guard: protocol + literal-IP fast check here; deliverWebhook
      // additionally re-validates the resolved IP at connection time.
      await assertPublicWebhookUrl(target.url);

      const secret = decryptSecret(target.secret);
      const sig = createHmac("sha256", secret).update(body).digest("hex");
      const { status } = await deliverWebhook(
        target.url,
        {
          "Content-Type": "application/json",
          "X-AgentGraph-Signature": `sha256=${sig}`,
        },
        body,
        DELIVERY_TIMEOUT_MS,
      );
      if (status < 200 || status >= 300) {
        console.warn(`[webhook] ${event} → ${target.url} returned ${status}`);
      }
    }),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[webhook] ${event} delivery failed:`, result.reason);
    }
  }
}
