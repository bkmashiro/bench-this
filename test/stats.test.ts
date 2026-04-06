import test from 'node:test'
import assert from 'node:assert/strict'
import {
  approximatePValue,
  calculateTValue,
  compareSamples,
  mean,
  standardDeviation,
  summarizeSamples,
} from '../src/stats.ts'

test('mean and standard deviation match expected sample statistics', () => {
  const samples = [10, 12, 14, 16]

  assert.equal(mean(samples), 13)
  assert.ok(Math.abs(standardDeviation(samples) - 2.581988897) < 1e-6)
})

test('calculateTValue uses the simplified two-sample t-test formula', () => {
  const tValue = calculateTValue(2450, 30, 10, 2380, 35, 10)

  assert.ok(Math.abs(tValue - 4.80196038399) < 1e-6)
})

test('approximatePValue maps large t-values to a significant p-value bucket', () => {
  assert.equal(approximatePValue(2.2), 0.05)
  assert.equal(approximatePValue(0.9), 0.5)
})

test('compareSamples marks clearly separated benchmark samples as significant', () => {
  const current = [2450, 2460, 2440, 2455, 2465, 2435, 2450, 2448, 2452, 2461]
  const baseline = [2380, 2375, 2388, 2379, 2383, 2370, 2385, 2378, 2381, 2374]
  const result = compareSamples(current, baseline)

  assert.equal(result.isSignificant, true)
  assert.equal(result.pValue, 0.001)
  assert.ok(result.deltaPct > 2.5)
})

test('compareSamples treats overlapping samples as likely noise', () => {
  const current = [1100, 1110, 1095, 1102, 1098, 1105, 1099, 1101, 1104, 1097]
  const baseline = [1098, 1107, 1092, 1104, 1101, 1100, 1096, 1102, 1105, 1099]
  const result = compareSamples(current, baseline)

  assert.equal(result.isSignificant, false)
  assert.equal(result.pValue, 0.5)
})

// Edge cases

test('mean of empty array returns 0 without throwing', () => {
  assert.equal(mean([]), 0)
})

test('standardDeviation of empty array returns 0 without throwing', () => {
  assert.equal(standardDeviation([]), 0)
})

test('summarizeSamples with empty array returns zeroes, no NaN', () => {
  const result = summarizeSamples([])

  assert.equal(result.mean, 0)
  assert.equal(result.standardDeviation, 0)
  assert.ok(!Number.isNaN(result.mean))
  assert.ok(!Number.isNaN(result.standardDeviation))
})

test('summarizeSamples with single element has zero standard deviation', () => {
  const result = summarizeSamples([42])

  assert.equal(result.mean, 42)
  assert.equal(result.standardDeviation, 0)
  assert.ok(!Number.isNaN(result.standardDeviation))
})

test('calculateTValue with zero denominators avoids division by zero', () => {
  // Both means equal, both SDs zero — identical samples
  assert.equal(calculateTValue(100, 0, 1, 100, 0, 1), 0)

  // Means differ, both SDs zero — infinite separation
  assert.equal(calculateTValue(200, 0, 1, 100, 0, 1), Number.POSITIVE_INFINITY)
})

test('approximatePValue with Infinity or very large t-value returns smallest bucket', () => {
  assert.equal(approximatePValue(Number.POSITIVE_INFINITY), 0.001)
  assert.equal(approximatePValue(Number.NEGATIVE_INFINITY), 0.001)
  assert.equal(approximatePValue(1e9), 0.001)
})

test('approximatePValue does not return NaN for any finite input', () => {
  const inputs = [0, 0.5, 1, 1.725, 2.093, 2.326, 2.576, 2.878, 3.291, 10]
  for (const t of inputs) {
    assert.ok(!Number.isNaN(approximatePValue(t)), `NaN for t=${t}`)
    assert.ok(!Number.isNaN(approximatePValue(-t)), `NaN for t=${-t}`)
  }
})

test('compareSamples handles very large numbers without precision loss', () => {
  const large = 1e14
  const samples1 = [large, large + 1000, large - 1000]
  const samples2 = [large + 5000, large + 6000, large + 4000]
  const result = compareSamples(samples1, samples2)

  assert.ok(!Number.isNaN(result.tValue))
  assert.ok(!Number.isNaN(result.pValue))
  assert.ok(!Number.isNaN(result.deltaPct))
})

test('compareSamples handles very small numbers without underflow to NaN', () => {
  const samples1 = [1e-12, 2e-12, 1.5e-12]
  const samples2 = [3e-12, 4e-12, 3.5e-12]
  const result = compareSamples(samples1, samples2)

  assert.ok(!Number.isNaN(result.tValue))
  assert.ok(!Number.isNaN(result.pValue))
  assert.ok(!Number.isNaN(result.deltaPct))
})

test('compareSamples with single-element samples (zero SD) does not throw or produce NaN', () => {
  const result = compareSamples([100], [200])

  assert.ok(!Number.isNaN(result.tValue))
  assert.ok(!Number.isNaN(result.pValue))
  assert.ok(!Number.isNaN(result.deltaPct))
})

test('compareSamples with empty samples returns zeroed result without NaN', () => {
  const result = compareSamples([], [])

  assert.equal(result.mean1, 0)
  assert.equal(result.mean2, 0)
  assert.ok(!Number.isNaN(result.tValue))
  assert.ok(!Number.isNaN(result.pValue))
  assert.ok(!Number.isNaN(result.deltaPct))
})
