import { Bench } from 'tinybench'
import { pathToFileURL } from 'url'
import { readFileSync } from 'fs'
import { extname } from 'path'
import type { BenchTarget } from './extractor.js'

export interface BenchResult {
  name: string
  opsPerSec: number
  avgMs: number
  p99Ms: number
}

export async function runBenchmark(target: BenchTarget): Promise<BenchResult | null> {
  try {
    const mod = await loadBenchmarkModule(target.file)

    // Find the function - try the display name or scan for @bench targets
    // We need to match by original function name, not label
    const funcName = getFuncName(target)
    const defaultExport = mod.default as Record<string, unknown> | undefined
    const fn = mod[funcName] || defaultExport?.[funcName]

    if (!fn || typeof fn !== 'function') {
      console.error(`  Could not find function "${funcName}" in ${target.file}`)
      return null
    }

    const bench = new Bench({
      iterations: target.options.iterations ?? 100,
      warmupIterations: 10,
    })

    let inputValue: unknown
    if (target.options.input) {
      try {
        inputValue = eval(target.options.input)
      } catch {
        inputValue = target.options.input
      }
    }

    bench.add(target.name, () => {
      if (inputValue !== undefined) {
        fn(inputValue)
      } else {
        fn()
      }
    })

    await bench.run()

    const task = bench.tasks[0]
    if (!task?.result) return null

    // tinybench v6 changed the result structure
    const result = task.result as unknown as {
      throughput?: { mean?: number }
      latency?: { mean?: number; p99?: number }
    }

    const opsPerSec = result.throughput?.mean ?? 0
    const avgMs = result.latency?.mean ?? 0
    const p99Ms = result.latency?.p99 ?? 0

    return {
      name: target.name,
      opsPerSec,
      avgMs,
      p99Ms,
    }
  } catch (err) {
    console.error(`  Error running benchmark "${target.name}":`, err)
    return null
  }
}

async function loadBenchmarkModule(file: string): Promise<Record<string, unknown>> {
  const fileUrl = pathToFileURL(file).href

  if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(file))) {
    const { tsImport } = await import('tsx/esm/api')
    return tsImport(fileUrl, import.meta.url) as Promise<Record<string, unknown>>
  }

  return import(fileUrl) as Promise<Record<string, unknown>>
}

function getFuncName(target: BenchTarget): string {
  // If there's a label, we stored the label as name; need to find actual func name
  // Re-extract from file to get the real function name
  const content = readFileSync(target.file, 'utf-8')

  const BENCH_PATTERN = /\/\/\s*@bench([^\n]*)\n\s*((?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/gm

  let match: RegExpExecArray | null
  while ((match = BENCH_PATTERN.exec(content)) !== null) {
    const optStr = match[1] || ''
    const funcName = match[3] || match[4]
    const labelMatch = optStr.match(/label\s*=\s*"([^"]*)"/)
    const nameMatch = optStr.match(/name\s*=\s*"([^"]*)"/)
    const label = labelMatch?.[1] ?? nameMatch?.[1]

    if (label === target.name || funcName === target.name) {
      return funcName!
    }
  }

  return target.name
}

export async function runAll(targets: BenchTarget[]): Promise<BenchResult[]> {
  const results: BenchResult[] = []
  for (const target of targets) {
    const result = await runBenchmark(target)
    if (result) results.push(result)
  }
  return results
}
