/**
 * Tool regression detection (spec 02) — the "Downdetector" thresholds.
 *
 * Pure + unit-testable so the nightly aggregator and tests share one source of
 * truth. Given a tool's *current* daily snapshot and its trailing history, this
 * returns zero or more regressions:
 *
 *   - success_rate : successRate dropped ≥ SUCCESS_RATE_DROP vs trailing median
 *   - latency      : p95LatencyMs rose ≥ LATENCY_RISE_PCT vs trailing median
 *   - cost         : costPerCallUsd rose ≥ COST_RISE_PCT vs trailing median
 *   - rug_pull     : the tool's definitionHash changed AND a reliability/latency
 *                    regression appeared in the same window
 *
 * Guardrails: a regression is only emitted when the current window has enough
 * volume (totalCalls ≥ MIN_TOTAL_CALLS) so noise doesn't page anyone.
 */

// Success-rate drop (absolute points) that counts as a regression. 0.08 = 8 pts.
export const SUCCESS_RATE_DROP = 0.08;
// Relative rise (fraction) in p95 latency / cost-per-call vs trailing median.
export const LATENCY_RISE_PCT = 0.5;
export const COST_RISE_PCT = 0.5;
// Minimum sample in the current window before any alert fires.
export const MIN_TOTAL_CALLS = 50;

export type RegressionKind = "success_rate" | "latency" | "cost" | "rug_pull";

export interface ToolSnapshot {
  successRate: number | null;
  p95LatencyMs: number | null;
  costPerCallUsd: number | null;
  totalCalls: number | null;
}

export interface RegressionMetrics {
  successRate: number | null;
  p95LatencyMs: number | null;
  costPerCallUsd: number | null;
}

export interface Regression {
  kind: RegressionKind;
  current: RegressionMetrics;
  baseline: RegressionMetrics;
}

/** Median of the non-null values, or null when there's nothing to median. */
function median(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export interface DetectOptions {
  /** True when the tool's definitionHash changed within the window (rug-pull signal). */
  definitionChanged?: boolean;
}

/**
 * Compare a current snapshot against its trailing history. `history` should be
 * the trailing window (e.g. last 7 days) EXCLUDING the current day.
 */
export function detectRegressions(
  current: ToolSnapshot,
  history: ToolSnapshot[],
  opts: DetectOptions = {},
): Regression[] {
  const regressions: Regression[] = [];

  // Sample guardrail — thin windows never page.
  if ((current.totalCalls ?? 0) < MIN_TOTAL_CALLS) return regressions;
  if (history.length === 0) return regressions;

  const baseSuccess = median(history.map((h) => h.successRate));
  const baseLatency = median(history.map((h) => h.p95LatencyMs));
  const baseCost = median(history.map((h) => h.costPerCallUsd));

  const baseline: RegressionMetrics = {
    successRate: baseSuccess,
    p95LatencyMs: baseLatency,
    costPerCallUsd: baseCost,
  };
  const cur: RegressionMetrics = {
    successRate: current.successRate,
    p95LatencyMs: current.p95LatencyMs,
    costPerCallUsd: current.costPerCallUsd,
  };

  let reliabilityOrLatencyRegressed = false;

  // Reliability regression — absolute drop in success rate.
  if (
    baseSuccess !== null &&
    current.successRate !== null &&
    baseSuccess - current.successRate >= SUCCESS_RATE_DROP
  ) {
    regressions.push({ kind: "success_rate", current: cur, baseline });
    reliabilityOrLatencyRegressed = true;
  }

  // Latency regression — relative rise in p95.
  if (
    baseLatency !== null &&
    baseLatency > 0 &&
    current.p95LatencyMs !== null &&
    (current.p95LatencyMs - baseLatency) / baseLatency >= LATENCY_RISE_PCT
  ) {
    regressions.push({ kind: "latency", current: cur, baseline });
    reliabilityOrLatencyRegressed = true;
  }

  // Cost regression — relative rise in cost-per-call.
  if (
    baseCost !== null &&
    baseCost > 0 &&
    current.costPerCallUsd !== null &&
    (current.costPerCallUsd - baseCost) / baseCost >= COST_RISE_PCT
  ) {
    regressions.push({ kind: "cost", current: cur, baseline });
  }

  // Rug-pull: the contract changed AND performance regressed together.
  if (opts.definitionChanged && reliabilityOrLatencyRegressed) {
    regressions.push({ kind: "rug_pull", current: cur, baseline });
  }

  return regressions;
}
