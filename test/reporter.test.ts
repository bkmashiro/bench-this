import test from 'node:test'
import assert from 'node:assert/strict'
import { printReport } from '../src/reporter.ts'
import type { CompareResult } from '../src/reporter.ts'

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-9;]*m/g, '')
}

function captureReport(comparisons: CompareResult[]): string {
  const lines: string[] = []
  const originalLog = console.log

  console.log = (...args: unknown[]) => {
    lines.push(args.join(' '))
  }

  try {
    printReport(comparisons)
  } finally {
    console.log = originalLog
  }

  return stripAnsi(lines.join('\n'))
}

test('reporter shows "regression" when current is more than 20% slower than baseline', () => {
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

test('reporter shows "improvement" when current is more than 20% faster than baseline', () => {
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
