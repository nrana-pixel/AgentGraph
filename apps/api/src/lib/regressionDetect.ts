/**
 * Tool regression detection (spec 02) — the "Downdetector" thresholds.
 *
 * Mirror of apps/worker/src/lib/regressionDetect.ts (same pattern as
 * modelCosts) so the API can derive a tool's health status from its history
 * using the exact same thresholds the worker alerts on. Keep both copies in
 * sync.
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

function median(values: Array<number | null | undefined>): number | null {
  const nums = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export interface DetectOptions {
  definitionChanged?: boolean;
}

export function detectRegressions(
  current: ToolSnapshot,
  history: ToolSnapshot[],
  opts: DetectOptions = {},
): Regression[] {
  const regressions: Regression[] = [];

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

  if (
    baseSuccess !== null &&
    current.successRate !== null &&
    baseSuccess - current.successRate >= SUCCESS_RATE_DROP
  ) {
    regressions.push({ kind: "success_rate", current: cur, baseline });
    reliabilityOrLatencyRegressed = true;
  }

  if (
    baseLatency !== null &&
    baseLatency > 0 &&
    current.p95LatencyMs !== null &&
    (current.p95LatencyMs - baseLatency) / baseLatency >= LATENCY_RISE_PCT
  ) {
    regressions.push({ kind: "latency", current: cur, baseline });
    reliabilityOrLatencyRegressed = true;
  }

  if (
    baseCost !== null &&
    baseCost > 0 &&
    current.costPerCallUsd !== null &&
    (current.costPerCallUsd - baseCost) / baseCost >= COST_RISE_PCT
  ) {
    regressions.push({ kind: "cost", current: cur, baseline });
  }

  if (opts.definitionChanged && reliabilityOrLatencyRegressed) {
    regressions.push({ kind: "rug_pull", current: cur, baseline });
  }

  return regressions;
}
