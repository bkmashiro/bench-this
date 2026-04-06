import { Bench } from 'tinybench'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { extname, join, resolve } from 'path'
import { spawn } from 'child_process'
import { tmpdir } from 'os'
import type { BenchTarget } from './extractor.js'
import { standardDeviation } from './stats.js'
import { runPythonBenchmark } from './runner-py.js'

export interface BenchResult {
  name: string
  opsPerSec: number
  avgMs: number
  p99Ms: number
  samples?: number[]
  stdDevOpsPerSec?: number
}

export interface ProfileHotspot {
  name: string
  percentage: number
  file?: string
  line?: number
  isUserCode: boolean
}

export interface ProfileResult {
  name: string
  totalTimeMs: number
  hotspots: ProfileHotspot[]
  suggestion?: string
}

export async function runBenchmark(target: BenchTarget): Promise<BenchResult | null> {
  if (target.lang === 'py') {
    return runPythonBenchmark(target)
  }

  try {
    const { fn } = await resolveBenchmarkFunction(target)

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

export async function runBenchmarkWithSamples(target: BenchTarget, sampleCount = 10): Promise<BenchResult | null> {
  const samples: number[] = []
  const runs: BenchResult[] = []

  for (let i = 0; i < sampleCount; i += 1) {
    const result = await runBenchmark(target)
    if (!result) {
      return null
    }

    runs.push(result)
    samples.push(result.opsPerSec)
  }

  const avgMs = runs.reduce((sum, run) => sum + run.avgMs, 0) / runs.length
  const p99Ms = runs.reduce((sum, run) => sum + run.p99Ms, 0) / runs.length
  const opsPerSec = samples.reduce((sum, value) => sum + value, 0) / samples.length

  return {
    name: target.name,
    opsPerSec,
    avgMs,
    p99Ms,
    samples,
    stdDevOpsPerSec: standardDeviation(samples),
  }
}

async function loadBenchmarkModule(file: string): Promise<Record<string, unknown>> {
  const fileUrl = pathToFileURL(file).href

  if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(file))) {
    const { tsImport } = await import('tsx/esm/api')
    const parentUrl = pathToFileURL(join(process.cwd(), '__bench-this_runner__.mjs')).href
    return tsImport(fileUrl, parentUrl) as Promise<Record<string, unknown>>
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

export async function runAllWithSamples(targets: BenchTarget[], sampleCount = 10): Promise<BenchResult[]> {
  const results: BenchResult[] = []
  for (const target of targets) {
    const result = await runBenchmarkWithSamples(target, sampleCount)
    if (result) results.push(result)
  }
  return results
}

export async function profileBenchmark(target: BenchTarget, durationMs = 2000): Promise<ProfileResult | null> {
  const tempDir = mkdtempSync(join(tmpdir(), 'bench-this-prof-'))
  const profileArgs = getProfileWorkerArgs(target, durationMs)

  try {
    const workerOutput = await runProcess(process.execPath, profileArgs, tempDir)
    const logFile = await findProfileLog(tempDir)
    const processed = await runProcess(process.execPath, ['--prof-process', logFile], tempDir)
    const totalTimeMs = parseProfileWorkerOutput(workerOutput)
    const funcName = getFuncName(target)
    const hotspots = parseHotspots(processed, resolve(target.file), funcName).slice(0, 5)

    return {
      name: target.name,
      totalTimeMs,
      hotspots,
      suggestion: buildSuggestion(hotspots),
    }
  } catch (err) {
    console.error(`  Error profiling benchmark "${target.name}":`, err)
    return null
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

export async function profileAll(targets: BenchTarget[], durationMs = 2000): Promise<ProfileResult[]> {
  const results: ProfileResult[] = []
  for (const target of targets) {
    const result = await profileBenchmark(target, durationMs)
    if (result) results.push(result)
  }
  return results
}

async function resolveBenchmarkFunction(target: BenchTarget): Promise<{ fn: Function; funcName: string }> {
  const mod = await loadBenchmarkModule(target.file)
  const funcName = getFuncName(target)
  const defaultExport = mod.default as Record<string, unknown> | undefined
  const fn = mod[funcName] || defaultExport?.[funcName]

  if (!fn || typeof fn !== 'function') {
    throw new Error(`Could not find function "${funcName}" in ${target.file}`)
  }

  return { fn, funcName }
}

function getProfileWorkerArgs(target: BenchTarget, durationMs: number): string[] {
  const jsWorkerPath = new URL('./profile-worker.js', import.meta.url)
  const tsWorkerPath = new URL('./profile-worker.ts', import.meta.url)
  const funcName = getFuncName(target)
  const input = target.options.input ?? ''

  if (extname(fileURLToPath(import.meta.url)) === '.js') {
    return ['--prof', fileURLToPath(jsWorkerPath), target.file, funcName, input, String(durationMs)]
  }

  const tsxCliPath = new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url)
  return ['--prof', fileURLToPath(tsxCliPath), fileURLToPath(tsWorkerPath), target.file, funcName, input, String(durationMs)]
}

function runProcess(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolvePromise(stdout)
        return
      }

      reject(new Error(stderr.trim() || `Process exited with code ${code}`))
    })
  })
}

async function findProfileLog(cwd: string): Promise<string> {
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(cwd)
  const logFile = files.find(file => file.startsWith('isolate-') && file.endsWith('-v8.log'))

  if (!logFile) {
    throw new Error('CPU profile log was not generated.')
  }

  return join(cwd, logFile)
}

function parseProfileWorkerOutput(stdout: string): number {
  const lastLine = stdout.trim().split('\n').filter(Boolean).at(-1)
  if (!lastLine) return 0

  try {
    const payload = JSON.parse(lastLine) as { totalTimeMs?: number }
    return payload.totalTimeMs ?? 0
  } catch {
    return 0
  }
}

function parseHotspots(output: string, targetFile: string, funcName: string): ProfileHotspot[] {
  const hotspots: ProfileHotspot[] = []
  const lines = output.split('\n')
  const totalTicks = parseTotalTicks(output)
  let section: 'javascript' | 'cpp' | 'bottomup' | 'other' = 'other'

  for (const line of lines) {
    if (line.startsWith(' [JavaScript]:')) {
      section = 'javascript'
      continue
    }
    if (line.startsWith(' [C++]:')) {
      section = 'cpp'
      continue
    }
    if (line.startsWith(' [Bottom up')) {
      section = 'bottomup'
      continue
    }
    if (line.startsWith(' [Summary]:') || line.startsWith(' [Shared libraries]:')) {
      section = 'other'
      continue
    }

    if (section === 'javascript') {
      const match = line.match(/^\s*\d+\s+([\d.]+)%\s+[\d.]+%\s+(?:JS|Script):\s+[~*^]?(.+?)\s+(file:\/\/\S+|\/\S+):(\d+):\d+\s*$/)
      if (!match) continue

      const [, pct, rawName, rawFile, rawLine] = match
      const file = normalizeProfileFile(rawFile)
      hotspots.push({
        name: rawName.trim(),
        percentage: Number(pct),
        file,
        line: Number(rawLine),
        isUserCode: resolve(file) === targetFile && rawName.trim() === funcName,
      })
      continue
    }

    if (section === 'cpp') {
      const match = line.match(/^\s*\d+\s+([\d.]+)%\s+[\d.]+%\s+t\s+(_Builtins_[A-Za-z0-9_]+)\s*$/)
      if (!match) continue

      const [, pct, builtinName] = match
      hotspots.push({
        name: formatBuiltinName(builtinName),
        percentage: Number(pct),
        isUserCode: false,
      })
    }

    if (section === 'bottomup' && totalTicks > 0) {
      const match = line.match(/^\s*(\d+)\s+[\d.]+%\s+(?:JS|Script):\s+[+^~*]?(.+?)\s+(file:\/\/\S+|\/\S+):(\d+):\d+\s*$/)
      if (!match) continue

      const [, ticks, rawName, rawFile, rawLine] = match
      const file = normalizeProfileFile(rawFile)
      const percentage = (Number(ticks) / totalTicks) * 100

      hotspots.push({
        name: rawName.trim(),
        percentage,
        file,
        line: Number(rawLine),
        isUserCode: resolve(file) === targetFile && rawName.trim() === funcName,
      })
    }
  }

  hotspots.sort((a, b) => b.percentage - a.percentage)
  return dedupeHotspots(hotspots)
}

function parseTotalTicks(output: string): number {
  const match = output.match(/\((\d+) ticks,/)
  return match ? Number(match[1]) : 0
}

function normalizeProfileFile(rawFile: string): string {
  if (rawFile.startsWith('file://')) {
    return fileURLToPath(rawFile)
  }

  return rawFile
}

function formatBuiltinName(name: string): string {
  return name
    .replace(/^_Builtins_/, '')
    .replace(/^ArrayPrototype/, 'Array.prototype.')
    .replace(/^TypedArrayPrototypeJoin$/, 'TypedArray.prototype.join')
    .replace(/^ArrayPrototypeJoinImpl$/, 'Array.prototype.join')
    .replace(/^ArrayPrototypeUnshift$/, 'Array.prototype.unshift')
    .replace(/^JSONParse$/, 'JSON.parse')
}

function dedupeHotspots(hotspots: ProfileHotspot[]): ProfileHotspot[] {
  const seen = new Set<string>()
  return hotspots.filter(hotspot => {
    const key = `${hotspot.name}:${hotspot.file ?? ''}:${hotspot.line ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildSuggestion(hotspots: ProfileHotspot[]): string | undefined {
  const suggestionTarget = hotspots.find(hotspot => !hotspot.isUserCode)
  if (!suggestionTarget) return undefined

  if (suggestionTarget.name === 'Array.prototype.map') {
    return `Array.map accounts for ${suggestionTarget.percentage.toFixed(0)}% — consider using a for loop for hot paths`
  }

  if (suggestionTarget.name === 'JSON.parse') {
    return `JSON.parse accounts for ${suggestionTarget.percentage.toFixed(0)}% — consider parsing once and reusing the result`
  }

  return undefined
}
