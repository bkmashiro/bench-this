import test from 'node:test'
import assert from 'node:assert/strict'
import { diffBenchmarkResults } from '../src/comparer.ts'

test('diffBenchmarkResults classifies improvements, regressions, and missing benchmarks', () => {
  const comparisons = diffBenchmarkResults(
    [
      { name: 'processArray', opsPerSec: 2450, avgMs: 0.4, p99Ms: 0.6 },
      { name: 'processObject', opsPerSec: 2700, avgMs: 0.5, p99Ms: 0.7 },
      { name: 'newOnly', opsPerSec: 1200, avgMs: 0.8, p99Ms: 1.1 },
    ],
    [
      { name: 'processArray', opsPerSec: 1234, avgMs: 0.8, p99Ms: 1.2 },
      { name: 'processObject', opsPerSec: 2891, avgMs: 0.45, p99Ms: 0.7 },
      { name: 'mainOnly', opsPerSec: 900, avgMs: 1, p99Ms: 1.4 },
    ],
  )

  assert.deepEqual(
    comparisons.map(item => item.name),
    ['mainOnly', 'newOnly', 'processArray', 'processObject'],
  )

  assert.equal(comparisons[0].status, 'missing-current')
  assert.equal(comparisons[1].status, 'missing-branch')
  assert.equal(comparisons[2].status, 'improved')
  assert.equal(comparisons[2].pctChange?.toFixed(1), '98.5')
  assert.equal(comparisons[3].status, 'regression')
  assert.equal(comparisons[3].pctChange?.toFixed(1), '-6.6')
})
