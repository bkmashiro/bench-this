import { extname } from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'

function parseInput(raw: string | undefined): unknown {
  if (raw === undefined) return undefined

  try {
    return eval(raw)
  } catch {
    return raw
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

const [file, funcName, rawInput, rawDuration] = process.argv.slice(2)

if (!file || !funcName) {
  console.error('Missing benchmark target information for profile worker.')
  process.exit(1)
}

const inputValue = parseInput(rawInput)
const durationMs = Number(rawDuration) || 2000
const mod = await loadBenchmarkModule(file)
const defaultExport = mod.default as Record<string, unknown> | undefined
const fn = mod[funcName] || defaultExport?.[funcName]

if (typeof fn !== 'function') {
  console.error(`Could not find function "${funcName}" in ${file}`)
  process.exit(1)
}

const startedAt = performance.now()
const deadline = startedAt + durationMs

while (performance.now() < deadline) {
  if (inputValue !== undefined) {
    await fn(inputValue)
  } else {
    await fn()
  }
}

const totalTimeMs = performance.now() - startedAt
console.log(JSON.stringify({ totalTimeMs }))
