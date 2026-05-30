import { createHash } from "crypto";

/**
 * Contract fingerprint for a tool (spec 02 rug-pull detection / spec 03
 * re-score trigger): sha256(name + description + JSON.stringify(inputSchema)).
 *
 * inputSchema may arrive as an already-stringified JSON column or null; we hash
 * its canonical string form so the same contract always yields the same hash.
 */
export function computeDefinitionHash(
  name: string,
  description: string | null,
  inputSchema: string | null,
): string {
  return createHash("sha256")
    .update(name)
    .update(description ?? "")
    .update(JSON.stringify(inputSchema ?? null))
    .digest("hex");
}
