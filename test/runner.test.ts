import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runBenchmark } from '../src/runner.ts'
import type { BenchTarget } from '../src/extractor.ts'

function withPatchedConsoleError<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => undefined

  return fn().finally(() => {
    console.error = original
  })
}

test('runBenchmark returns null when the function is not exported by the module', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'missing.ts')
  const target: BenchTarget = {
    name: 'missingFn',
    file: filePath,
    line: 1,
    options: {},
  }

  try {
    writeFileSync(filePath, 'export function present() { return 1 }\n')

    const result = await withPatchedConsoleError(() => runBenchmark(target))

    assert.equal(result, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBenchmark executes async benchmark functions', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'async-bench.ts')
  const target: BenchTarget = {
    name: 'fetchData',
    file: filePath,
    line: 1,
    options: {
      iterations: 1,
    },
  }

  try {
    writeFileSync(filePath, 'export async function fetchData() { return 42 }\n')

    const result = await runBenchmark(target)

    assert.ok(result)
    assert.equal(result.name, 'fetchData')
    assert.equal(typeof result.opsPerSec, 'number')
    assert.equal(typeof result.avgMs, 'number')
    assert.equal(typeof result.p99Ms, 'number')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
