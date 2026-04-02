import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runAll, runBenchmark } from '../src/runner.ts'
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
    writeFileSync(
      filePath,
      'export async function fetchData() { await new Promise(resolve => setTimeout(resolve, 1)); return 42 }\n',
    )

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

test('runBenchmark resolves labeled targets back to the original exported function name', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'labeled.ts')
  const target: BenchTarget = {
    name: 'Friendly benchmark',
    file: filePath,
    line: 1,
    options: {
      iterations: 1,
    },
  }

  try {
    writeFileSync(
      filePath,
      '// @bench name="Friendly benchmark"\nexport function actualFn() { const start = Date.now(); while (Date.now() - start < 1) {} return 42 }\n',
    )

    const result = await runBenchmark(target)

    assert.ok(result)
    assert.equal(result.name, 'Friendly benchmark')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBenchmark falls back to the raw input string when eval throws', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'input-fallback.ts')
  const target: BenchTarget = {
    name: 'takesRawString',
    file: filePath,
    line: 1,
    options: {
      iterations: 1,
      input: 'not valid javascript',
    },
  }

  try {
    writeFileSync(
      filePath,
      'export function takesRawString(value: string) { if (value !== "not valid javascript") throw new Error("unexpected input"); const start = Date.now(); while (Date.now() - start < 1) {} }\n',
    )

    const result = await withPatchedConsoleError(() => runBenchmark(target))

    assert.ok(result)
    assert.equal(result.name, 'takesRawString')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBenchmark can load native ESM modules without tsx', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'default-export.mjs')
  const target: BenchTarget = {
    name: 'defaultFn',
    file: filePath,
    line: 1,
    options: {
      iterations: 1,
    },
  }

  try {
    writeFileSync(
      filePath,
      'export default { defaultFn() { const start = Date.now(); while (Date.now() - start < 1) {} return 1 } }\n',
    )

    const result = await runBenchmark(target)

    assert.ok(result)
    assert.equal(result.name, 'defaultFn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBenchmark returns null when module loading fails', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'broken.ts')
  const target: BenchTarget = {
    name: 'brokenFn',
    file: filePath,
    line: 1,
    options: {},
  }

  try {
    writeFileSync(filePath, 'export function brokenFn( { return 1 }\n')

    const result = await withPatchedConsoleError(() => runBenchmark(target))

    assert.equal(result, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runAll filters out null benchmark results', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const goodFile = path.join(dir, 'good.ts')
  const badFile = path.join(dir, 'bad.ts')

  try {
    writeFileSync(
      goodFile,
      'export function goodFn() { const start = Date.now(); while (Date.now() - start < 1) {} return 1 }\n',
    )
    writeFileSync(badFile, 'export function present() { return 1 }\n')

    const results = await withPatchedConsoleError(() =>
      runAll([
        {
          name: 'goodFn',
          file: goodFile,
          line: 1,
          options: { iterations: 1 },
        },
        {
          name: 'missingFn',
          file: badFile,
          line: 1,
          options: {},
        },
      ]),
    )

    assert.equal(results.length, 1)
    assert.equal(results[0].name, 'goodFn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
