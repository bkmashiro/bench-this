import test from 'node:test'
import assert from 'node:assert/strict'
import { compare, printList, printReport } from '../src/reporter.ts'
import type { CompareResult } from '../src/reporter.ts'

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, '')
}

function captureReport(comparisons: CompareResult[], threshold = 10): string {
  const lines: string[] = []
  const originalLog = console.log

  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '))
  }

  try {
    printReport(comparisons, false, threshold)
  } finally {
    console.log = originalLog
  }

  return stripAnsi(lines.join('\n'))
}

function captureLogs(fn: () => void): string {
  const lines: string[] = []
  const originalLog = console.log

  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '))
  }

  try {
    fn()
  } finally {
    console.log = originalLog
  }

  return stripAnsi(lines.join('\n'))
}

test('reporter shows "regression" when pctChange exceeds the threshold negatively', () => {
  const output = captureReport([
    {
      result: { name: 'addNumbers', opsPerSec: 70, avgMs: 1.2, p99Ms: 1.6 },
      baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
      pctChange: -30,
      isRegression: true,
    },
  ])

  assert.match(output, /regression/)
})

test('reporter shows "improvement" when pctChange exceeds the threshold positively', () => {
  const output = captureReport([
    {
      result: { name: 'addNumbers', opsPerSec: 130, avgMs: 0.7, p99Ms: 1.1 },
      baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
      pctChange: 30,
      isRegression: false,
    },
  ])

  assert.match(output, /improvement/)
})

test('reporter shows "stable" when performance is within the threshold', () => {
  const output = captureReport([
    {
      result: { name: 'addNumbers', opsPerSec: 110, avgMs: 0.9, p99Ms: 1.2 },
      baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
      pctChange: 10,
      isRegression: false,
    },
  ])

  assert.match(output, /stable/)
})

test('reporter formats output correctly with ops/sec', () => {
  const output = captureReport([
    {
      result: { name: 'addNumbers', opsPerSec: 12345, avgMs: 0.081, p99Ms: 0.12 },
      baseline: { opsPerSec: 10000, avgMs: 0.1, savedAt: '2026-04-02' },
      pctChange: 23.45,
      isRegression: false,
    },
  ])

  assert.match(output, /12,345 ops\/s/)
  assert.match(output, /0\.081ms avg/)
})

test('reporter handles missing baseline as a first run correctly', () => {
  const output = captureReport([
    {
      result: { name: 'addNumbers', opsPerSec: 12345, avgMs: 0.081, p99Ms: 0.12 },
      isRegression: false,
    },
  ])

  assert.match(output, /first run/i)
  assert.match(output, /Run `bench-this save` to set baseline/)
})

test('compare marks regressions based on the provided threshold and preserves new benchmarks', () => {
  const comparisons = compare(
    [
      { name: 'slowerFn', opsPerSec: 79, avgMs: 1.2, p99Ms: 1.5 },
      { name: 'newFn', opsPerSec: 300, avgMs: 0.4, p99Ms: 0.7 },
    ],
    {
      slowerFn: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
    },
    20,
  )

  assert.equal(comparisons[0].isRegression, true)
  assert.equal(comparisons[0].pctChange, -21)
  assert.equal(comparisons[1].baseline, undefined)
  assert.equal(comparisons[1].isRegression, false)
})

test('reporter emits JSON when requested', () => {
  const output = captureLogs(() => {
    printReport(
      [
        {
          result: { name: 'jsonFn', opsPerSec: 10, avgMs: 1, p99Ms: 1.4 },
          isRegression: false,
        },
      ],
      true,
    )
  })

  assert.doesNotThrow(() => JSON.parse(output))
  assert.match(output, /"jsonFn"/)
})

test('reporter prints a summary line when all benchmarks are within threshold', () => {
  const output = captureReport([
    {
      result: { name: 'steadyFn', opsPerSec: 105, avgMs: 0.95, p99Ms: 1.1 },
      baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
      pctChange: 5,
      isRegression: false,
    },
  ])

  assert.match(output, /All benchmarks within threshold/)
})

test('reporter prints pluralized regression summary for multiple failures', () => {
  const output = captureReport([
    {
      result: { name: 'slowA', opsPerSec: 60, avgMs: 1.6, p99Ms: 2 },
      baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
      pctChange: -40,
      isRegression: true,
    },
    {
      result: { name: 'slowB', opsPerSec: 50, avgMs: 1.8, p99Ms: 2.2 },
      baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
      pctChange: -50,
      isRegression: true,
    },
  ])

  assert.match(output, /2 regressions found/)
})

test('reporter respects a custom threshold: 5% change is a regression at threshold=5', () => {
  const output = captureReport(
    [
      {
        result: { name: 'borderFn', opsPerSec: 94, avgMs: 1.1, p99Ms: 1.4 },
        baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
        pctChange: -6,
        isRegression: true,
      },
    ],
    5,
  )

  assert.match(output, /regression/)
})

test('reporter respects a custom threshold: 5% change is stable at threshold=10', () => {
  const output = captureReport(
    [
      {
        result: { name: 'borderFn', opsPerSec: 94, avgMs: 1.1, p99Ms: 1.4 },
        baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
        pctChange: -6,
        isRegression: false,
      },
    ],
    10,
  )

  assert.match(output, /stable/)
})

test('reporter treats pctChange exactly equal to threshold as stable (not regression)', () => {
  const output = captureReport(
    [
      {
        result: { name: 'exactFn', opsPerSec: 90, avgMs: 1.1, p99Ms: 1.4 },
        baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
        pctChange: -10,
        isRegression: false,
      },
    ],
    10,
  )

  assert.match(output, /stable/)
})

test('reporter treats pctChange exactly equal to threshold as stable (not improvement)', () => {
  const output = captureReport(
    [
      {
        result: { name: 'exactFn', opsPerSec: 110, avgMs: 0.9, p99Ms: 1.1 },
        baseline: { opsPerSec: 100, avgMs: 1, savedAt: '2026-04-02' },
        pctChange: 10,
        isRegression: false,
      },
    ],
    10,
  )

  assert.match(output, /stable/)
})

test('printList shows iteration and input metadata when present', () => {
  const output = captureLogs(() => {
    printList([
      {
        name: 'namedFn',
        file: '/tmp/example.ts',
        line: 12,
        options: {
          iterations: 25,
          input: '[1, 2, 3]',
        },
      },
    ])
  })

  assert.match(output, /namedFn/)
  assert.match(output, /\/tmp\/example\.ts:12/)
  assert.match(output, /iterations: 25/)
  assert.match(output, /input: \[1, 2, 3\]/)
  assert.match(output, /1 function found/)
})
