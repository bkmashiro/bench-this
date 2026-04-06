import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runPythonBenchmark } from '../src/runner-py.ts'
import type { BenchTarget } from '../src/extractor.ts'

function withPatchedConsoleError<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => undefined
  return fn().finally(() => {
    console.error = original
  })
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'bench-this-py-'))
}

function pyTarget(name: string, file: string, options: BenchTarget['options']): BenchTarget {
  return { name, file, line: 1, lang: 'py', options }
}

test('runPythonBenchmark returns basic result shape', async () => {
  const dir = makeTempDir()
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, 'def add():\n    return 1 + 1\n')
    const result = await runPythonBenchmark(pyTarget('add', filePath, { iterations: 100 }))

    assert.ok(result != null)
    assert.equal(result.name, 'add')
    assert.equal(typeof result.opsPerSec, 'number')
    assert.equal(typeof result.avgMs, 'number')
    assert.equal(typeof result.p99Ms, 'number')
    assert.ok(result.opsPerSec > 0)
    assert.ok(result.avgMs > 0)
    assert.ok(result.p99Ms > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark p99Ms >= avgMs', async () => {
  const dir = makeTempDir()
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, 'def noop():\n    pass\n')
    const result = await runPythonBenchmark(pyTarget('noop', filePath, { iterations: 200 }))

    assert.ok(result != null)
    assert.ok(
      result.p99Ms >= result.avgMs,
      `p99Ms (${result.p99Ms}) should be >= avgMs (${result.avgMs})`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark p99Ms differs from avgMs when variance exists', async () => {
  const dir = makeTempDir()
  const filePath = path.join(dir, 'bench.py')

  try {
    // Every 10th call sleeps 10ms, the rest return immediately — guarantees spread
    writeFileSync(
      filePath,
      [
        'import time',
        '_call_count = 0',
        'def variable_sleep():',
        '    global _call_count',
        '    _call_count += 1',
        '    if _call_count % 10 == 0:',
        '        time.sleep(0.01)',
      ].join('\n') + '\n',
    )

    const result = await runPythonBenchmark(
      pyTarget('variable_sleep', filePath, { iterations: 100 }),
    )

    assert.ok(result != null)
    assert.ok(
      result.p99Ms > result.avgMs,
      `p99Ms (${result.p99Ms}) should be > avgMs (${result.avgMs}) when iteration times vary`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark returns null when the function does not exist', async () => {
  const dir = makeTempDir()
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, 'def other():\n    pass\n')
    const result = await withPatchedConsoleError(() =>
      runPythonBenchmark(pyTarget('missing_fn', filePath, {})),
    )
    assert.equal(result, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark returns null when the file does not exist', async () => {
  const result = await withPatchedConsoleError(() =>
    runPythonBenchmark(pyTarget('fn', '/nonexistent/path/bench.py', {})),
  )
  assert.equal(result, null)
})

test('runPythonBenchmark single iteration has p99Ms equal to avgMs', async () => {
  const dir = makeTempDir()
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, 'def single():\n    return 42\n')
    const result = await runPythonBenchmark(pyTarget('single', filePath, { iterations: 1 }))

    assert.ok(result != null)
    assert.equal(
      result.p99Ms,
      result.avgMs,
      'with one iteration p99Ms and avgMs should be the same value',
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
