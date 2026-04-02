import test from 'node:test'
import assert from 'node:assert/strict'
import {
  approximatePValue,
  calculateTValue,
  compareSamples,
  mean,
  standardDeviation,
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
