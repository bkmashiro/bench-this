import { readFileSync } from 'fs'
import { glob } from 'glob'
import * as path from 'path'

export interface BenchTarget {
  name: string
  file: string
  line: number
  options: {
    label?: string
    iterations?: number
    input?: string
  }
}

const BENCH_PATTERN = /\/\/\s*@bench([^\n]*)\n\s*((?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/gm

function parseOptions(optStr: string): BenchTarget['options'] {
  const opts: BenchTarget['options'] = {}

  const nameMatch = optStr.match(/name\s*=\s*"([^"]*)"/)
  if (nameMatch) opts.label = nameMatch[1]

  const iterMatch = optStr.match(/iterations\s*=\s*(\d+)/)
  if (iterMatch) opts.iterations = parseInt(iterMatch[1])

  const inputMatch = optStr.match(/input\s*=\s*'([^']*)'/)
  if (inputMatch) opts.input = inputMatch[1]

  return opts
}

export function extractBenchTargets(filePath: string): BenchTarget[] {
  const content = readFileSync(filePath, 'utf-8')
  const targets: BenchTarget[] = []

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
      options: opts,
    })
  }

  return targets
}

export async function findBenchTargets(searchPath: string): Promise<BenchTarget[]> {
  const stats = await import('fs').then(fs => fs.promises.stat(searchPath).catch(() => null))

  let files: string[]
  if (stats?.isDirectory()) {
    files = await glob('**/*.{ts,js}', {
      cwd: searchPath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/*.d.ts']
    })
  } else {
    files = [path.resolve(searchPath)]
  }

  const allTargets: BenchTarget[] = []
  for (const file of files) {
    try {
      allTargets.push(...extractBenchTargets(file))
    } catch {
      // skip files that can't be read
    }
  }

  return allTargets
}
