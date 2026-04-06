import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { findBenchTargets } from './extractor.js'
import { runAll, type BenchResult } from './runner.js'

const execFileAsync = promisify(execFile)

export interface BranchCompareResult {
  name: string
  current?: BenchResult
  branch?: BenchResult
  pctChange?: number
  status: 'improved' | 'regression' | 'missing-current' | 'missing-branch' | 'unchanged'
}

export interface CompareBranchesDependencies {
  findTargets?: typeof findBenchTargets
  runBenchmarks?: typeof runAll
  runGit?: (args: string[]) => Promise<string>
  log?: (...args: unknown[]) => void
}

/**
 * Computes the diff between two sets of benchmark results.
 *
 * Merges `currentResults` and `branchResults` by benchmark name. Each name present
 * in either set produces one {@link BranchCompareResult}. The `pctChange` is expressed
 * as `((current - branch) / branch) * 100`, so a positive value means the current
 * branch is faster. When `branch.opsPerSec` is zero, `pctChange` is `undefined`.
 *
 * @param currentResults - Results measured on the current branch.
 * @param branchResults - Results measured on the target branch being compared against.
 * @returns An array of comparison entries sorted alphabetically by benchmark name.
 */
export function diffBenchmarkResults(
  currentResults: BenchResult[],
  branchResults: BenchResult[],
): BranchCompareResult[] {
  const currentMap = new Map(currentResults.map(result => [result.name, result]))
  const branchMap = new Map(branchResults.map(result => [result.name, result]))
  const names = Array.from(new Set([...currentMap.keys(), ...branchMap.keys()])).sort()

  return names.map(name => {
    const current = currentMap.get(name)
    const branch = branchMap.get(name)

    if (!current) {
      return { name, branch, status: 'missing-current' }
    }

    if (!branch) {
      return { name, current, status: 'missing-branch' }
    }

    const pctChange = branch.opsPerSec === 0
      ? undefined
      : ((current.opsPerSec - branch.opsPerSec) / branch.opsPerSec) * 100

    let status: BranchCompareResult['status'] = 'unchanged'
    if (pctChange !== undefined) {
      if (pctChange > 0) status = 'improved'
      if (pctChange < 0) status = 'regression'
    }

    return { name, current, branch, pctChange, status }
  })
}

/**
 * Prints a human-readable branch comparison table to the provided logger.
 *
 * Each comparison is rendered on its own line showing the ops/sec for both branches,
 * the percentage change, and a status indicator (✅ improved / ⚠ regression / unchanged).
 * Benchmarks missing from one branch are clearly labelled.
 *
 * @param comparisons - Diff entries produced by {@link diffBenchmarkResults}.
 * @param currentBranch - Name of the current branch (shown in "new on X" messages).
 * @param targetBranch - Name of the branch being compared against (shown as a column header).
 * @param log - Logger function; defaults to `console.log`.
 */
export function printBranchComparison(
  comparisons: BranchCompareResult[],
  currentBranch: string,
  targetBranch: string,
  log: (...args: unknown[]) => void = console.log,
): void {
  log()
  log('Results:')

  for (const comparison of comparisons) {
    if (!comparison.current) {
      log(
        `  ${comparison.name.padEnd(16)} current: n/a   ${targetBranch}: ${formatOps(comparison.branch?.opsPerSec ?? 0)} ops/sec   missing on current branch`
      )
      continue
    }

    if (!comparison.branch) {
      log(
        `  ${comparison.name.padEnd(16)} current: ${formatOps(comparison.current.opsPerSec)} ops/sec   ${targetBranch}: n/a   new on ${currentBranch}`
      )
      continue
    }

    const pctChange = comparison.pctChange ?? 0
    const sign = pctChange >= 0 ? '+' : ''
    const indicator = comparison.status === 'improved'
      ? '✅ improved'
      : comparison.status === 'regression'
        ? '⚠ regression'
        : 'unchanged'

    log(
      `  ${comparison.name.padEnd(16)} current: ${formatOps(comparison.current.opsPerSec)} ops/sec   ${targetBranch}: ${formatOps(comparison.branch.opsPerSec)} ops/sec   ${sign}${pctChange.toFixed(1)}% ${indicator}`
    )
  }

  log()
}

/**
 * Runs benchmarks on the current branch and `targetBranch`, then returns the diff.
 *
 * The function:
 * 1. Records the current branch name and checks for uncommitted changes.
 * 2. Runs benchmarks against the current working tree.
 * 3. Stashes any local changes (if present), checks out `targetBranch`, and runs
 *    benchmarks there.
 * 4. Always restores the original branch and pops the stash in a `finally` block,
 *    even if benchmarking fails.
 *
 * All side-effecting operations (git, benchmark runner, discovery, logging) are
 * injectable via `deps` to support testing without spawning real processes.
 *
 * @param searchPath - Directory to search for benchmark targets.
 * @param targetBranch - Git branch to compare the current branch against.
 * @param deps - Optional dependency overrides for testing.
 * @returns The comparison results, one entry per unique benchmark name across both branches.
 * @throws {Error} If git operations fail (e.g. branch does not exist, merge conflicts
 *   prevent stash pop) or if benchmarks throw.
 */
export async function compareAgainstBranch(
  searchPath: string,
  targetBranch: string,
  deps: CompareBranchesDependencies = {},
): Promise<BranchCompareResult[]> {
  const findTargets = deps.findTargets ?? findBenchTargets
  const runBenchmarks = deps.runBenchmarks ?? runAll
  const runGit = deps.runGit ?? createGitRunner()
  const log = deps.log ?? console.log

  const currentBranch = await runGit(['branch', '--show-current'])
  const hasLocalChanges = (await runGit(['status', '--porcelain'])).trim().length > 0

  log(`Running benchmarks on current branch (${currentBranch})...`)
  const currentResults = await runBenchmarksForPath(searchPath, findTargets, runBenchmarks)

  let stashed = false

  try {
    if (hasLocalChanges) {
      await runGit(['stash', 'push', '--include-untracked', '--message', 'bench-this compare'])
      stashed = true
    }

    await runGit(['checkout', targetBranch])
    log(`Running benchmarks on ${targetBranch}...`)
    const branchResults = await runBenchmarksForPath(searchPath, findTargets, runBenchmarks)
    const comparisons = diffBenchmarkResults(currentResults, branchResults)

    printBranchComparison(comparisons, currentBranch, targetBranch, log)
    return comparisons
  } finally {
    await runGit(['checkout', currentBranch])

    if (stashed) {
      await runGit(['stash', 'pop'])
    }
  }
}

async function runBenchmarksForPath(
  searchPath: string,
  findTargets: typeof findBenchTargets,
  runBenchmarks: typeof runAll,
): Promise<BenchResult[]> {
  const targets = await findTargets(searchPath)

  if (targets.length === 0) {
    return []
  }

  return runBenchmarks(targets)
}

function formatOps(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function createGitRunner(): (args: string[]) => Promise<string> {
  return async (args: string[]) => {
    const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' })
    return stdout.trim()
  }
}
