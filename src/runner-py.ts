import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import type { BenchTarget } from './extractor.js'
import type { BenchResult } from './runner.js'
import { PY_BENCH_PATTERN } from './patterns.js'

export function buildHarnessScript(target: BenchTarget, funcName: string): string {
  const modulePath = target.file.replace(/\\/g, '/')
  const iterations = target.options.iterations ?? 1000
  const inputRepr = target.options.input !== undefined ? target.options.input : 'None'
  const callExpr = inputRepr === 'None' ? `${funcName}()` : `${funcName}(${inputRepr})`

  return `
import sys
import json
import timeit
import importlib.util

spec = importlib.util.spec_from_file_location("_bench_module", ${JSON.stringify(modulePath)})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
${funcName} = getattr(mod, ${JSON.stringify(funcName)})

iterations = ${iterations}
elapsed = timeit.timeit(lambda: ${callExpr}, number=iterations)

ops_per_sec = iterations / elapsed if elapsed > 0 else 0
avg_ms = (elapsed / iterations) * 1000

print(json.dumps({"opsPerSec": ops_per_sec, "avgMs": avg_ms, "p99Ms": avg_ms}))
`.trim()
}

export function getPyFuncName(target: BenchTarget): string {
  const content = readFileSync(target.file, 'utf-8')
  PY_BENCH_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PY_BENCH_PATTERN.exec(content)) !== null) {
    const optStr = match[1] || ''
    const funcName = match[2]
    const labelMatch = optStr.match(/label\s*=\s*"([^"]*)"/)
    const nameMatch = optStr.match(/name\s*=\s*"([^"]*)"/)
    const label = labelMatch?.[1] ?? nameMatch?.[1]

    if (label === target.name || funcName === target.name) {
      return funcName
    }
  }

  return target.name
}

/**
 * Runs a single Python benchmark target and returns its timing results.
 *
 * **Temp-file lifecycle**: a self-contained harness script is written to a
 * randomly-named file under `os.tmpdir()` before `python3` is invoked. The
 * file is deleted in a `finally` block regardless of whether the run succeeds
 * or fails, so it is never left behind on disk.
 *
 * **JSON protocol**: the harness script prints a single JSON object to stdout
 * on its last line: `{ opsPerSec, avgMs, p99Ms }`. Only the last non-empty
 * line is parsed so any incidental print statements in the benchmarked module
 * do not interfere.
 *
 * @param target - The benchmark target describing the file, function name, and
 *   options (iterations, input value) to use.
 * @returns A {@link BenchResult} on success, or `null` if the process fails or
 *   the output cannot be parsed (the error is logged to stderr).
 */
export async function runPythonBenchmark(target: BenchTarget): Promise<BenchResult | null> {
  try {
    const funcName = getPyFuncName(target)
    const script = buildHarnessScript(target, funcName)
    const tmpFile = join(tmpdir(), `bench-this-py-${randomBytes(8).toString('hex')}.py`)

    try {
      writeFileSync(tmpFile, script, 'utf-8')

      const result = spawnSync('python3', [tmpFile], {
        encoding: 'utf-8',
        timeout: 60_000,
      })

      if (result.error) {
        throw result.error
      }

      if (result.status !== 0) {
        throw new Error(result.stderr?.trim() || `python3 exited with code ${result.status}`)
      }

      const lastLine = result.stdout.trim().split('\n').filter(Boolean).at(-1)
      if (!lastLine) throw new Error('No output from Python harness')

      let parsed: { opsPerSec: number; avgMs: number; p99Ms: number }
      try {
        parsed = JSON.parse(lastLine) as { opsPerSec: number; avgMs: number; p99Ms: number }
      } catch {
        throw new Error('Failed to parse Python benchmark output: ' + lastLine)
      }

      return {
        name: target.name,
        opsPerSec: parsed.opsPerSec,
        avgMs: parsed.avgMs,
        p99Ms: parsed.p99Ms,
      }
    } finally {
      try { unlinkSync(tmpFile) } catch { /* ignore */ }
    }
  } catch (err) {
    console.error(`  Error running Python benchmark "${target.name}":`, err)
    return null
  }
}
