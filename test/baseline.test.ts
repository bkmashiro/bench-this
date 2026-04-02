import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { loadBaseline, saveBaseline } from '../src/baseline.ts'
import type { BenchResult } from '../src/runner.ts'

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'bench-this-baseline-'))
}

function sampleResults(): BenchResult[] {
  return [
    {
      name: 'addNumbers',
      opsPerSec: 12345,
      avgMs: 0.081,
      p99Ms: 0.12,
    },
  ]
}

test('baseline saves results to .bench-baseline.json', () => {
  const dir = makeTempDir()

  try {
    saveBaseline(sampleResults(), dir)

    assert.equal(existsSync(path.join(dir, '.bench-baseline.json')), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('baseline reads existing baseline correctly', () => {
  const dir = makeTempDir()

  try {
    saveBaseline(sampleResults(), dir)

    const baseline = loadBaseline(dir)

    assert.ok(baseline)
    assert.equal(baseline.addNumbers.opsPerSec, 12345)
    assert.equal(baseline.addNumbers.avgMs, 0.081)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('baseline returns null for a missing baseline file', () => {
  const dir = makeTempDir()

  try {
    assert.equal(loadBaseline(dir), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('baseline handles corrupt JSON gracefully', () => {
  const dir = makeTempDir()

  try {
    writeFileSync(path.join(dir, '.bench-baseline.json'), '{not valid json')

    assert.equal(loadBaseline(dir), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('baseline writes benchmark payload with savedAt metadata', () => {
  const dir = makeTempDir()

  try {
    saveBaseline(sampleResults(), dir)
    const raw = JSON.parse(readFileSync(path.join(dir, '.bench-baseline.json'), 'utf8'))

    assert.match(raw.addNumbers.savedAt, /^\d{4}-\d{2}-\d{2}$/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
