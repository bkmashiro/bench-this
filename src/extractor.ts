import { readFileSync } from 'fs'
import { glob } from 'glob'
import * as path from 'path'

/**
 * Represents a single benchmark target discovered in a source file.
 */
export interface BenchTarget {
  /** Display name for the benchmark, derived from `label`/`name` option or the function name. */
  name: string
  /** Absolute path to the file containing this benchmark. */
  file: string
  /** 1-based line number of the `@bench` annotation. */
  line: number
  /** Source language of the file. */
  lang: 'js' | 'py'
  /** Parsed options from the `@bench` annotation. */
  options: {
    /** Overrides the display name shown in results. */
    label?: string
    /** Number of iterations to run (overrides the default). */
    iterations?: number
    /** Input string passed to the benchmarked function. */
    input?: string
  }
}

// Matches `// @bench(...)` annotations on the line immediately before a JS/TS function declaration.
// Group 1: raw option string (e.g. ` label="foo" iterations=100`)
// Group 3: function name for `function foo` / `async function foo` style declarations
// Group 4: variable name for `const foo = (` / `const foo = async (` style arrow functions
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

  const inputMatch = optStr.match(/input\s*=\s*(['"])([^'"]*?)\1/)
  if (inputMatch) opts.input = inputMatch[2]

  return opts
}

/**
 * Extracts all benchmark targets from a single source file by scanning for `@bench` annotations.
 *
 * Supports both JavaScript/TypeScript (`.ts`, `.js`) and Python (`.py`) files.
 *
 * @param filePath - Absolute or relative path to the source file to scan.
 * @returns Array of {@link BenchTarget} objects found in the file, in source order.
 * @throws {Error} If the file cannot be read (e.g. permission denied or does not exist).
 */
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

/**
 * Discovers benchmark targets under a given path, handling files, directories, and glob patterns.
 *
 * - If `searchPath` is a directory, recursively searches it for matching source files.
 * - If `searchPath` is a file, extracts targets from that file only.
 * - Otherwise, treats `searchPath` as a glob pattern relative to `process.cwd()`.
 *
 * @param searchPath - A file path, directory path, or glob pattern to search.
 * @param langs - Languages to include; defaults to `['js', 'py']`. Controls which file
 *   extensions are matched (`ts`/`js` for `'js'`, `py` for `'py'`).
 * @returns Promise resolving to all {@link BenchTarget} objects discovered.
 */
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

/**
 * Discovers benchmark targets matching one or more glob patterns.
 *
 * `node_modules` and TypeScript declaration files (`.d.ts`) are always excluded.
 *
 * @param patterns - A single glob pattern or array of glob patterns (e.g. `'src/**\/*.ts'`).
 * @param cwd - Working directory used to resolve relative patterns. Defaults to `process.cwd()`.
 * @returns Promise resolving to all {@link BenchTarget} objects found across matched files.
 */
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
