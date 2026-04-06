import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import type { BenchTarget } from './extractor.js'
import type { BenchResult } from './runner.js'

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
  const PY_BENCH_PATTERN = /#\s*@bench([^\n]*)\n\s*(?:async\s+)?def\s+(\w+)/gm

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

      const parsed = JSON.parse(lastLine) as { opsPerSec: number; avgMs: number; p99Ms: number }

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
