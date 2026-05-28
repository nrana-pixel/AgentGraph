import { createHash } from "node:crypto";
import type { TraceStepInput } from "@agentgraph/types";

/**
 * Redaction / hashing options. All optional. Applied to each step in this
 * order: (1) redactKeys, (2) hashInputs, (3) redact hook.
 *
 * Note: when both `redactKeys` and `hashInputs` are set, redactKeys runs
 * first, so the resulting hash reflects the already-redacted content. This is
 * intentional — it is the safer posture (secrets never enter the digest).
 */
export interface RedactOptions {
  /**
   * Keys to redact from each step's `input` and `output`, recursively over
   * nested objects and arrays. Matching values are replaced with the string
   * `"[REDACTED]"` (the key is kept so the shape is preserved).
   */
  redactKeys?: string[];
  /**
   * When true, replace each step's `input` and `output` with a stable SHA-256
   * hex digest of their JSON, shaped as `{ _sha256: "<hex>" }`. The object
   * form is required because the server schema types input/output as records,
   * not strings.
   */
  hashInputs?: boolean;
  /**
   * User hook applied last, after redactKeys and hashInputs. Receives the
   * (already transformed) step and returns the final step. Full control.
   */
  redact?: (step: TraceStepInput) => TraceStepInput;
}

const REDACTED = "[REDACTED]";

/** Deep-clone a value while replacing any property whose key is in `keys`. */
function redactValue(value: unknown, keys: Set<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => redactValue(v, keys));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = keys.has(k) ? REDACTED : redactValue(v, keys);
    }
    return out;
  }
  return value;
}

function sha256Of(value: unknown): { _sha256: string } {
  const json = JSON.stringify(value ?? null);
  return { _sha256: createHash("sha256").update(json).digest("hex") };
}

/**
 * Apply the configured redaction pipeline to a step. Pure: returns a new
 * object and never mutates the input. Returns the step unchanged when no
 * options are set.
 */
export function applyRedaction(
  step: TraceStepInput,
  opts: RedactOptions | undefined
): TraceStepInput {
  if (!opts) return step;
  let next: TraceStepInput = step;

  // 1. redactKeys — deep strip matching keys from input/output.
  if (opts.redactKeys && opts.redactKeys.length > 0) {
    const keys = new Set(opts.redactKeys);
    next = { ...next };
    if (next.input !== undefined) {
      next.input = redactValue(next.input, keys) as Record<string, unknown>;
    }
    if (next.output !== undefined) {
      next.output = redactValue(next.output, keys) as Record<string, unknown>;
    }
  }

  // 2. hashInputs — collapse input/output to a SHA-256 digest object.
  if (opts.hashInputs) {
    next = { ...next };
    if (next.input !== undefined) next.input = sha256Of(next.input);
    if (next.output !== undefined) next.output = sha256Of(next.output);
  }

  // 3. user hook — full control, applied last.
  if (opts.redact) {
    next = opts.redact(next);
  }

  return next;
}
