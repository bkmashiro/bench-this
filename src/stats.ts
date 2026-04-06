export interface SampleSummary {
  mean: number
  standardDeviation: number
}

export interface SignificanceResult {
  mean1: number
  mean2: number
  standardDeviation1: number
  standardDeviation2: number
  tValue: number
  pValue: number
  deltaPct: number
  isSignificant: boolean
}

const P_VALUE_TABLE = [
  { t: 3.291, p: 0.001 },
  { t: 2.878, p: 0.004 },
  { t: 2.576, p: 0.01 },
  { t: 2.326, p: 0.02 },
  { t: 2.093, p: 0.05 },
  { t: 1.725, p: 0.1 },
] as const

export function mean(samples: number[]): number {
  if (samples.length === 0) return 0
  return samples.reduce((sum, value) => sum + value, 0) / samples.length
}

export function standardDeviation(samples: number[]): number {
  if (samples.length <= 1) return 0

  const avg = mean(samples)
  const variance = samples.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (samples.length - 1)
  return Math.sqrt(variance)
}

export function summarizeSamples(samples: number[]): SampleSummary {
  return {
    mean: mean(samples),
    standardDeviation: standardDeviation(samples),
  }
}

/**
 * Computes Welch's t-statistic for two independent samples with potentially unequal variances.
 *
 * Formula: `(mean1 - mean2) / sqrt(sd1² / n1 + sd2² / n2)`
 *
 * @param mean1 - Mean of the first sample.
 * @param sd1 - Sample standard deviation of the first sample.
 * @param n1 - Number of observations in the first sample.
 * @param mean2 - Mean of the second sample.
 * @param sd2 - Sample standard deviation of the second sample.
 * @param n2 - Number of observations in the second sample.
 * @returns The t-statistic. Returns `0` when both means are equal and the denominator is zero;
 *   returns `Infinity` / `-Infinity` when means differ but the denominator is zero.
 */
export function calculateTValue(mean1: number, sd1: number, n1: number, mean2: number, sd2: number, n2: number): number {
  const denominator = Math.sqrt((sd1 ** 2) / n1 + (sd2 ** 2) / n2)
  if (denominator === 0) {
    return mean1 === mean2 ? 0 : Number.POSITIVE_INFINITY
  }

  return (mean1 - mean2) / denominator
}

/**
 * Maps an absolute t-statistic to an approximate two-tailed p-value using a fixed lookup table.
 *
 * The table covers the range `p ∈ {0.001, 0.004, 0.01, 0.02, 0.05, 0.1}`. Values below the
 * smallest threshold return `0.5` (no evidence of significance), matching the behavior of a
 * large-sample normal approximation for very small t-values.
 *
 * @param tValue - The t-statistic (sign is ignored; the absolute value is used).
 * @returns An approximate two-tailed p-value. Returns `0.5` when `|tValue|` is below all table
 *   thresholds (i.e. the smallest critical value).
 */
export function approximatePValue(tValue: number): number {
  const absT = Math.abs(tValue)

  for (const entry of P_VALUE_TABLE) {
    if (absT >= entry.t) {
      return entry.p
    }
  }

  return 0.5
}

/**
 * Performs a Welch's t-test comparing two raw sample arrays and returns a full significance report.
 *
 * `deltaPct` is expressed as `(mean1 - mean2) / mean2 * 100`, so a positive value means sample 1
 * is faster/larger than sample 2. Returns `0` for `deltaPct` when `mean2` is zero.
 *
 * A result is considered statistically significant (`isSignificant: true`) when `p < 0.05`.
 *
 * @param samples1 - Raw measurements for the first variant (e.g. ops/sec per iteration).
 * @param samples2 - Raw measurements for the second variant.
 * @returns A {@link SignificanceResult} containing means, standard deviations, t-value, p-value,
 *   percentage delta, and a significance flag.
 */
export function compareSamples(samples1: number[], samples2: number[]): SignificanceResult {
  const summary1 = summarizeSamples(samples1)
  const summary2 = summarizeSamples(samples2)
  const tValue = calculateTValue(
    summary1.mean,
    summary1.standardDeviation,
    samples1.length,
    summary2.mean,
    summary2.standardDeviation,
    samples2.length,
  )
  const pValue = approximatePValue(tValue)
  const deltaPct = summary2.mean === 0 ? 0 : ((summary1.mean - summary2.mean) / summary2.mean) * 100

  return {
    mean1: summary1.mean,
    mean2: summary2.mean,
    standardDeviation1: summary1.standardDeviation,
    standardDeviation2: summary2.standardDeviation,
    tValue,
    pValue,
    deltaPct,
    isSignificant: pValue < 0.05,
  }
}
