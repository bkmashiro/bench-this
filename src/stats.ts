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

export function calculateTValue(mean1: number, sd1: number, n1: number, mean2: number, sd2: number, n2: number): number {
  const denominator = Math.sqrt((sd1 ** 2) / n1 + (sd2 ** 2) / n2)
  if (denominator === 0) {
    return mean1 === mean2 ? 0 : Number.POSITIVE_INFINITY
  }

  return (mean1 - mean2) / denominator
}

export function approximatePValue(tValue: number): number {
  const absT = Math.abs(tValue)

  for (const entry of P_VALUE_TABLE) {
    if (absT >= entry.t) {
      return entry.p
    }
  }

  return 0.5
}

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
