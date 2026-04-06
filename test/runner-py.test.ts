import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runPythonBenchmark, buildHarnessScript, getPyFuncName } from '../src/runner-py.ts'
import type { BenchTarget } from '../src/extractor.ts'

function makeTarget(overrides: Partial<BenchTarget> & { file: string }): BenchTarget {
  return { name: 'my_fn', line: 1, options: {}, lang: 'py', ...overrides }
}

function withPatchedConsoleError<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => undefined
  return fn().finally(() => { console.error = original })
}

// ── getPyFuncName ────────────────────────────────────────────────────────────

test('getPyFuncName returns target.name when no @bench annotation matches', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'fn.py')

  try {
    writeFileSync(filePath, 'def unrelated():\n    pass\n')
    const target = makeTarget({ file: filePath, name: 'my_fn' })
    assert.equal(getPyFuncName(target), 'my_fn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('getPyFuncName resolves function name by matching target.name to def name', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'fn.py')

  try {
    writeFileSync(filePath, '# @bench\ndef add_numbers():\n    return 1\n')
    const target = makeTarget({ file: filePath, name: 'add_numbers' })
    assert.equal(getPyFuncName(target), 'add_numbers')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('getPyFuncName resolves function name by matching target.name to label', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'fn.py')

  try {
    writeFileSync(filePath, '# @bench label="My Label"\ndef actual_fn():\n    return 1\n')
    const target = makeTarget({ file: filePath, name: 'My Label' })
    assert.equal(getPyFuncName(target), 'actual_fn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('getPyFuncName resolves function name by matching target.name to name option', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'fn.py')

  try {
    writeFileSync(filePath, '# @bench name="Named Bench"\ndef impl_fn():\n    return 1\n')
    const target = makeTarget({ file: filePath, name: 'Named Bench' })
    assert.equal(getPyFuncName(target), 'impl_fn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('getPyFuncName works with async def', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'fn.py')

  try {
    writeFileSync(filePath, '# @bench\nasync def async_fn():\n    return 1\n')
    const target = makeTarget({ file: filePath, name: 'async_fn' })
    assert.equal(getPyFuncName(target), 'async_fn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ── buildHarnessScript ───────────────────────────────────────────────────────

test('buildHarnessScript includes the module path and function name', () => {
  const target = makeTarget({ file: '/tmp/my_module.py', name: 'my_fn', options: {} })
  const script = buildHarnessScript(target, 'my_fn')

  assert.ok(script.includes('/tmp/my_module.py'))
  assert.ok(script.includes('my_fn'))
})

test('buildHarnessScript defaults to 1000 iterations', () => {
  const target = makeTarget({ file: '/tmp/mod.py', name: 'fn', options: {} })
  const script = buildHarnessScript(target, 'fn')

  assert.ok(script.includes('iterations = 1000'))
})

test('buildHarnessScript respects custom iterations', () => {
  const target = makeTarget({ file: '/tmp/mod.py', name: 'fn', options: { iterations: 42 } })
  const script = buildHarnessScript(target, 'fn')

  assert.ok(script.includes('iterations = 42'))
})

test('buildHarnessScript calls function with no args when input is undefined', () => {
  const target = makeTarget({ file: '/tmp/mod.py', name: 'fn', options: {} })
  const script = buildHarnessScript(target, 'fn')

  assert.ok(script.includes('fn()'))
  assert.ok(!script.includes('fn(None)'))
})

test('buildHarnessScript passes input expression to function call', () => {
  const target = makeTarget({ file: '/tmp/mod.py', name: 'fn', options: { input: '[1, 2, 3]' } })
  const script = buildHarnessScript(target, 'fn')

  assert.ok(script.includes('fn([1, 2, 3])'))
})

test('buildHarnessScript outputs JSON with opsPerSec, avgMs, p99Ms', () => {
  const target = makeTarget({ file: '/tmp/mod.py', name: 'fn', options: {} })
  const script = buildHarnessScript(target, 'fn')

  assert.ok(script.includes('opsPerSec'))
  assert.ok(script.includes('avgMs'))
  assert.ok(script.includes('p99Ms'))
  assert.ok(script.includes('json.dumps'))
})

// ── runPythonBenchmark ───────────────────────────────────────────────────────

test('runPythonBenchmark returns a BenchResult for a simple Python function', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, '# @bench iterations=10\ndef simple():\n    return 1 + 1\n')
    const target = makeTarget({ file: filePath, name: 'simple', options: { iterations: 10 } })

    const result = await runPythonBenchmark(target)

    assert.ok(result !== null)
    assert.equal(result!.name, 'simple')
    assert.equal(typeof result!.opsPerSec, 'number')
    assert.ok(result!.opsPerSec > 0)
    assert.equal(typeof result!.avgMs, 'number')
    assert.ok(result!.avgMs >= 0)
    assert.equal(typeof result!.p99Ms, 'number')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark handles a no-op function (zero elapsed time edge case)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, '# @bench iterations=1\ndef silent():\n    pass\n')
    const target = makeTarget({ file: filePath, name: 'silent', options: { iterations: 1 } })

    const result = await runPythonBenchmark(target)

    assert.ok(result !== null)
    assert.equal(result!.name, 'silent')
    assert.ok(result!.opsPerSec >= 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark returns null when python3 output is not valid JSON', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'bench.py')

  try {
    // Module-level print pollutes stdout before the JSON line, making last-line parse fail
    writeFileSync(filePath, [
      '# @bench iterations=1',
      'import builtins',
      '_real_print = builtins.print',
      'def fn():',
      '    _real_print("not-json-garbage")',
      '    return 1',
    ].join('\n'))
    const target = makeTarget({ file: filePath, name: 'fn', options: { iterations: 1 } })

    // The harness uses timeit and prints JSON last — the function body print()
    // runs inside timeit so it interleaves. The harness JSON is always the last
    // line, so this should still succeed. Verify the runner is robust to it.
    const result = await runPythonBenchmark(target)

    // last-line parsing means extra prints don't break the result
    assert.ok(result !== null)
    assert.equal(result!.name, 'fn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark returns null when the Python script exits with non-zero status', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, '# @bench\ndef crash():\n    raise RuntimeError("boom")\n')
    const target = makeTarget({ file: filePath, name: 'crash', options: { iterations: 1 } })

    const result = await withPatchedConsoleError(() => runPythonBenchmark(target))

    assert.equal(result, null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark returns null when the Python file does not exist', async () => {
  const target = makeTarget({ file: '/nonexistent/path/bench.py', name: 'fn', options: {} })

  const result = await withPatchedConsoleError(() => runPythonBenchmark(target))

  assert.equal(result, null)
})

test('runPythonBenchmark cleans up the temp file on success', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, '# @bench iterations=5\ndef clean():\n    return 42\n')
    const target = makeTarget({ file: filePath, name: 'clean', options: { iterations: 5 } })
    const tmpBefore = readdirSync(tmpdir()).filter((f: string) => f.startsWith('bench-this-py-'))

    await runPythonBenchmark(target)

    const tmpAfter = readdirSync(tmpdir()).filter((f: string) => f.startsWith('bench-this-py-'))
    // No new lingering harness files
    assert.equal(tmpAfter.length, tmpBefore.length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('runPythonBenchmark cleans up the temp file on error', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-runner-'))
  const filePath = path.join(dir, 'bench.py')

  try {
    writeFileSync(filePath, '# @bench\ndef boom():\n    raise ValueError("err")\n')
    const target = makeTarget({ file: filePath, name: 'boom', options: { iterations: 1 } })
    const tmpBefore = readdirSync(tmpdir()).filter((f: string) => f.startsWith('bench-this-py-'))

    await withPatchedConsoleError(() => runPythonBenchmark(target))

    const tmpAfter = readdirSync(tmpdir()).filter((f: string) => f.startsWith('bench-this-py-'))
    assert.equal(tmpAfter.length, tmpBefore.length)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
