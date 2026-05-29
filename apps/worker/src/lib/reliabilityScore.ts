/**
 * Tool Reliability Score (spec 01) — a tool-intrinsic 0–100 "credit rating".
 *
 * Pure + unit-testable so the nightly aggregator and tests share one source of
 * truth. The weights mirror the spec:
 *
 *   reliabilityScore = successRate   * 0.50
 *                    + latencyScore  * 0.20
 *                    + consistency   * 0.15
 *                    + adoption      * 0.15
 *
 * with a cold-start cap of 70 below 50 calls (matches the catalog graduation
 * rule in recommendationEngine / statsAggregator).
 */

const COLD_START_THRESHOLD = 50;
const COLD_START_CAP = 70;

// distinctOrgs that maps to a "full" adoption score of 100.
const ADOPTION_SATURATION = 50;

export interface ReliabilityInputs {
  /** Success fraction 0..1 (successCount / callCount). */
  successRate: number;
  /** This tool's p95 latency in ms. */
  p95LatencyMs: number;
  /** Median p95 across the tool's category — the latency yardstick. */
  categoryP95Median: number;
  /** Daily-success-rate stability 0..1 (1 = perfectly stable). */
  consistency: number;
  /** Distinct sharing orgs — log-normalised into the adoption term. */
  distinctOrgs: number;
  /** Total calls in the window — drives the cold-start cap. */
  totalCalls: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * latencyScore = clamp(100 - p95/categoryP95Median*50, 0, 100).
 * At the category median p95 the tool scores 50; faster → higher, slower → lower.
 * A non-positive median (no category baseline) yields a neutral 50.
 */
export function latencyScore(
  p95LatencyMs: number,
  categoryP95Median: number,
): number {
  if (!(categoryP95Median > 0)) return 50;
  return clamp(100 - (p95LatencyMs / categoryP95Median) * 50, 0, 100);
}

/**
 * adoption = log-normalised distinctOrgs, NOT raw call volume — so a tool used
 * widely (many orgs) outranks one hammered by a single org.
 */
export function adoptionScore(distinctOrgs: number): number {
  if (distinctOrgs <= 0) return 0;
  return Math.min(
    100,
    (Math.log(distinctOrgs + 1) / Math.log(ADOPTION_SATURATION + 1)) * 100,
  );
}

export function computeReliabilityScore(inputs: ReliabilityInputs): number {
  const {
    successRate,
    p95LatencyMs,
    categoryP95Median,
    consistency,
    distinctOrgs,
    totalCalls,
  } = inputs;

  const successTerm = clamp(successRate, 0, 1) * 100;
  const latency = latencyScore(p95LatencyMs, categoryP95Median);
  const consistencyTerm = clamp(consistency, 0, 1) * 100;
  const adoption = adoptionScore(distinctOrgs);

  const score =
    successTerm * 0.5 + latency * 0.2 + consistencyTerm * 0.15 + adoption * 0.15;

  const rounded = Math.round(clamp(score, 0, 100) * 100) / 100;

  // Cold-start cap: thin telemetry can't earn an A.
  if (totalCalls < COLD_START_THRESHOLD) return Math.min(rounded, COLD_START_CAP);
  return rounded;
}

export function gradeBand(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
