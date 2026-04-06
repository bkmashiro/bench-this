import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runAll, runBenchmark, parseInput } from '../src/runner.ts'
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
    lang: 'js',
    line: 1,
    lang: 'js',
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
    lang: 'js',
    line: 1,
    lang: 'js',
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
    lang: 'js',
    line: 1,
    lang: 'js',
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

test('parseInput parses JSON values correctly', () => {
  assert.deepEqual(parseInput('42'), 42)
  assert.deepEqual(parseInput('"hello"'), 'hello')
  assert.deepEqual(parseInput('[1,2,3]'), [1, 2, 3])
  assert.deepEqual(parseInput('{"key":1}'), { key: 1 })
  assert.deepEqual(parseInput('true'), true)
  assert.deepEqual(parseInput('null'), null)
})

test('parseInput parses JS object literals that are not valid JSON', () => {
  assert.deepEqual(parseInput('{key: 1}'), { key: 1 })
  assert.deepEqual(parseInput("'hello'"), 'hello')
})

test('parseInput rejects expressions with identifiers that could have side-effects', () => {
  assert.throws(() => parseInput('process.exit(1)'), /could not be parsed/)
  assert.throws(() => parseInput('require("fs")'), /could not be parsed/)
  assert.throws(() => parseInput('(function(){return {}})()'), /could not be parsed/)
  assert.throws(() => parseInput('new Date()'), /could not be parsed/)
})

test('runBenchmark returns null when input cannot be parsed as a safe literal', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'bad-input.ts')
  const target: BenchTarget = {
    name: 'someFunction',
    file: filePath,
    line: 1,
    lang: 'js',
    options: {
      iterations: 1,
      input: 'process.exit(1)',
    },
  }

  try {
    writeFileSync(filePath, 'export function someFunction(x: unknown) { return x }\n')

    const result = await withPatchedConsoleError(() => runBenchmark(target))

    assert.equal(result, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBenchmark parses JSON array input and passes it to the function', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'input-array.ts')
  const target: BenchTarget = {
    name: 'takesArray',
    file: filePath,
    lang: 'js',
    line: 1,
    options: {
      iterations: 1,
      input: '[1, 2, 3]',
    },
  }

  try {
    writeFileSync(
      filePath,
      'export function takesArray(value: unknown) { if (!Array.isArray(value) || value[0] !== 1) throw new Error("unexpected input"); const start = Date.now(); while (Date.now() - start < 1) {} }\n',
    )

    const result = await runBenchmark(target)

    assert.ok(result)
    assert.equal(result.name, 'takesArray')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBenchmark parses JSON object input and passes it to the function', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'input-object.ts')
  const target: BenchTarget = {
    name: 'takesObject',
    file: filePath,
    line: 1,
    options: {
      iterations: 1,
      input: '{"key":"value"}',
    },
  }

  try {
    writeFileSync(
      filePath,
      'export function takesObject(value: unknown) { if (typeof value !== "object" || value === null || (value as Record<string, unknown>).key !== "value") throw new Error("unexpected input"); const start = Date.now(); while (Date.now() - start < 1) {} }\n',
    )

    const result = await runBenchmark(target)

    assert.ok(result)
    assert.equal(result.name, 'takesObject')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runBenchmark does not execute code expressions in input (treats them as raw strings)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'input-expr.ts')
  // An eval-based implementation would execute this and return 2.
  // JSON.parse will fail, so the raw string must be passed as-is.
  const target: BenchTarget = {
    name: 'takesExpr',
    file: filePath,
    line: 1,
    options: {
      iterations: 1,
      input: '1 + 1',
    },
  }

  try {
    writeFileSync(
      filePath,
      'export function takesExpr(value: unknown) { if (value !== "1 + 1") throw new Error(`expected raw string, got: ${JSON.stringify(value)}`); const start = Date.now(); while (Date.now() - start < 1) {} }\n',
    )

    const result = await runBenchmark(target)

    assert.ok(result)
    assert.equal(result.name, 'takesExpr')
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
    lang: 'js',
    line: 1,
    lang: 'js',
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
    lang: 'js',
    line: 1,
    lang: 'js',
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

test('runBenchmark dispatches to the Python runner when lang is py', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-runner-'))
  const filePath = path.join(dir, 'pybench.py')

  try {
    writeFileSync(
      filePath,
      '# @bench\ndef pyFn():\n    return 42\n',
    )

    const target: BenchTarget = {
      name: 'pyFn',
      file: filePath,
      lang: 'py',
      line: 1,
      options: { iterations: 10 },
    }

    const result = await runBenchmark(target)

    assert.ok(result, 'expected a result from the Python runner')
    assert.equal(result.name, 'pyFn')
    assert.equal(typeof result.opsPerSec, 'number')
    assert.ok(result.opsPerSec > 0, 'opsPerSec should be positive')
    assert.equal(typeof result.avgMs, 'number')
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
          lang: 'js' as const,
          line: 1,
          lang: 'js' as const,
          options: { iterations: 1 },
        },
        {
          name: 'missingFn',
          file: badFile,
          lang: 'js' as const,
          line: 1,
          lang: 'js' as const,
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
