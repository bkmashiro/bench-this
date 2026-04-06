import { readFileSync } from 'fs'
import { glob } from 'glob'
import * as path from 'path'

export interface BenchTarget {
  name: string
  file: string
  line: number
  lang: 'js' | 'py'
  options: {
    label?: string
    iterations?: number
    input?: string
  }
}

const BENCH_PATTERN = /\/\/\s*@bench([^\n]*)\n\s*((?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/gm

const PY_BENCH_PATTERN = /#\s*@bench([^\n]*)\n\s*(?:async\s+)?def\s+(\w+)/gm

function parseOptions(optStr: string): BenchTarget['options'] {
  const opts: BenchTarget['options'] = {}

  const labelMatch = optStr.match(/label\s*=\s*"([^"]*)"/)
  if (labelMatch) opts.label = labelMatch[1]

  const nameMatch = optStr.match(/name\s*=\s*"([^"]*)"/)
  if (nameMatch && !opts.label) opts.label = nameMatch[1]

  const iterMatch = optStr.match(/iterations\s*=\s*(\d+)/)
  if (iterMatch) opts.iterations = parseInt(iterMatch[1])

  const inputMatch = optStr.match(/input\s*=\s*'([^']*)'/)
  if (inputMatch) opts.input = inputMatch[1]

  return opts
}

export function extractBenchTargets(filePath: string): BenchTarget[] {
  const content = readFileSync(filePath, 'utf-8')
  const targets: BenchTarget[] = []

  if (filePath.endsWith('.py')) {
    let match: RegExpExecArray | null
    PY_BENCH_PATTERN.lastIndex = 0

    while ((match = PY_BENCH_PATTERN.exec(content)) !== null) {
      const optStr = match[1] || ''
      const funcName = match[2]

      if (!funcName) continue

      const lineNum = content.slice(0, match.index).split('\n').length
      const opts = parseOptions(optStr)

      targets.push({
        name: opts.label || funcName,
        file: filePath,
        line: lineNum,
        lang: 'py',
        options: opts,
      })
    }

    return targets
  }

  let match: RegExpExecArray | null
  BENCH_PATTERN.lastIndex = 0

  while ((match = BENCH_PATTERN.exec(content)) !== null) {
    const optStr = match[1] || ''
    const funcName = match[3] || match[4]

    if (!funcName) continue

    const lineNum = content.slice(0, match.index).split('\n').length
    const opts = parseOptions(optStr)

    targets.push({
      name: opts.label || funcName,
      file: filePath,
      line: lineNum,
      lang: 'js',
      options: opts,
    })
  }

  return targets
}

export async function findBenchTargets(searchPath: string, langs: ('js' | 'py')[] = ['js', 'py']): Promise<BenchTarget[]> {
  const stats = await import('fs').then(fs => fs.promises.stat(searchPath).catch(() => null))

  const globParts: string[] = []
  if (langs.includes('js')) globParts.push('ts', 'js')
  if (langs.includes('py')) globParts.push('py')
  const ext = globParts.length === 1 ? globParts[0] : `{${globParts.join(',')}}`

  let files: string[]
  if (stats?.isDirectory()) {
    files = await resolveBenchFiles([`**/*.${ext}`], searchPath)
  } else {
    files = stats?.isFile()
      ? [path.resolve(searchPath)]
      : await resolveBenchFiles([searchPath], process.cwd())
  }

  return collectBenchTargets(files)
}

export async function findBenchTargetsByGlob(patterns: string | string[], cwd = process.cwd()): Promise<BenchTarget[]> {
  const files = await resolveBenchFiles(Array.isArray(patterns) ? patterns : [patterns], cwd)
  return collectBenchTargets(files)
}

async function resolveBenchFiles(patterns: string[], cwd: string): Promise<string[]> {
  const files = await glob(patterns, {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**', '**/*.d.ts']
  })

  return Array.from(new Set(files)).sort()
}

function collectBenchTargets(files: string[]): BenchTarget[] {
  const allTargets: BenchTarget[] = []
  for (const file of files) {
    try {
      allTargets.push(...extractBenchTargets(file))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`bench-this: skipping ${file}: ${message}`)
    }
  }

  return allTargets
}
