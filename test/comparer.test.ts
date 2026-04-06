import test from 'node:test'
import assert from 'node:assert/strict'
import { diffBenchmarkResults, printBranchComparison, compareAgainstBranch } from '../src/comparer.ts'
import type { BranchCompareResult } from '../src/comparer.ts'
import type { BenchResult } from '../src/runner.ts'

test('diffBenchmarkResults classifies improvements, regressions, and missing benchmarks', () => {
  const comparisons = diffBenchmarkResults(
    [
      { name: 'processArray', opsPerSec: 2450, avgMs: 0.4, p99Ms: 0.6 },
      { name: 'processObject', opsPerSec: 2700, avgMs: 0.5, p99Ms: 0.7 },
      { name: 'newOnly', opsPerSec: 1200, avgMs: 0.8, p99Ms: 1.1 },
    ],
    [
      { name: 'processArray', opsPerSec: 1234, avgMs: 0.8, p99Ms: 1.2 },
      { name: 'processObject', opsPerSec: 2891, avgMs: 0.45, p99Ms: 0.7 },
      { name: 'mainOnly', opsPerSec: 900, avgMs: 1, p99Ms: 1.4 },
    ],
  )

  assert.deepEqual(
    comparisons.map(item => item.name),
    ['mainOnly', 'newOnly', 'processArray', 'processObject'],
  )

  assert.equal(comparisons[0].status, 'missing-current')
  assert.equal(comparisons[1].status, 'missing-branch')
  assert.equal(comparisons[2].status, 'improved')
  assert.equal(comparisons[2].pctChange?.toFixed(1), '98.5')
  assert.equal(comparisons[3].status, 'regression')
  assert.equal(comparisons[3].pctChange?.toFixed(1), '-6.6')
})

test('diffBenchmarkResults returns unchanged when opsPerSec is identical', () => {
  const result = diffBenchmarkResults(
    [{ name: 'stableFn', opsPerSec: 1000, avgMs: 1, p99Ms: 2 }],
    [{ name: 'stableFn', opsPerSec: 1000, avgMs: 1, p99Ms: 2 }],
  )

  assert.equal(result.length, 1)
  assert.equal(result[0].status, 'unchanged')
  assert.equal(result[0].pctChange, 0)
})

test('diffBenchmarkResults returns undefined pctChange when branch opsPerSec is zero', () => {
  const result = diffBenchmarkResults(
    [{ name: 'zeroBranch', opsPerSec: 500, avgMs: 2, p99Ms: 3 }],
    [{ name: 'zeroBranch', opsPerSec: 0, avgMs: 0, p99Ms: 0 }],
  )

  assert.equal(result[0].pctChange, undefined)
  assert.equal(result[0].status, 'unchanged')
})

test('diffBenchmarkResults handles empty result sets', () => {
  assert.deepEqual(diffBenchmarkResults([], []), [])
  assert.deepEqual(diffBenchmarkResults([], [{ name: 'x', opsPerSec: 1, avgMs: 1, p99Ms: 1 }]), [
    { name: 'x', branch: { name: 'x', opsPerSec: 1, avgMs: 1, p99Ms: 1 }, status: 'missing-current' },
  ])
})

// ── printBranchComparison ────────────────────────────────────────────────────

function captureLog(): { lines: string[]; log: (...args: unknown[]) => void } {
  const lines: string[] = []
  const log = (...args: unknown[]) => lines.push(args.join(' '))
  return { lines, log }
}

const baseResult = (name: string, opsPerSec: number): BenchResult => ({
  name,
  opsPerSec,
  avgMs: 1,
  p99Ms: 2,
})

test('printBranchComparison labels improved benchmarks', () => {
  const { lines, log } = captureLog()
  const comparisons: BranchCompareResult[] = [
    {
      name: 'fastFn',
      current: baseResult('fastFn', 2000),
      branch: baseResult('fastFn', 1000),
      pctChange: 100,
      status: 'improved',
    },
  ]

  printBranchComparison(comparisons, 'feature', 'main', log)

  const output = lines.join('\n')
  assert.match(output, /✅ improved/)
  assert.match(output, /\+100\.0%/)
})

test('printBranchComparison labels regression benchmarks', () => {
  const { lines, log } = captureLog()
  const comparisons: BranchCompareResult[] = [
    {
      name: 'slowFn',
      current: baseResult('slowFn', 800),
      branch: baseResult('slowFn', 1000),
      pctChange: -20,
      status: 'regression',
    },
  ]

  printBranchComparison(comparisons, 'feature', 'main', log)

  const output = lines.join('\n')
  assert.match(output, /⚠ regression/)
  assert.match(output, /-20\.0%/)
})

test('printBranchComparison labels stable benchmarks', () => {
  const { lines, log } = captureLog()
  const comparisons: BranchCompareResult[] = [
    {
      name: 'stableFn',
      current: baseResult('stableFn', 1000),
      branch: baseResult('stableFn', 1000),
      pctChange: 0,
      status: 'unchanged',
    },
  ]

  printBranchComparison(comparisons, 'feature', 'main', log)

  const output = lines.join('\n')
  assert.match(output, /unchanged/)
})

test('printBranchComparison shows missing-current entry with n/a for current', () => {
  const { lines, log } = captureLog()
  const comparisons: BranchCompareResult[] = [
    {
      name: 'onlyOnBranch',
      branch: baseResult('onlyOnBranch', 500),
      status: 'missing-current',
    },
  ]

  printBranchComparison(comparisons, 'feature', 'main', log)

  const output = lines.join('\n')
  assert.match(output, /current: n\/a/)
  assert.match(output, /missing on current branch/)
})

test('printBranchComparison shows missing-branch entry with n/a for target', () => {
  const { lines, log } = captureLog()
  const comparisons: BranchCompareResult[] = [
    {
      name: 'newOnFeature',
      current: baseResult('newOnFeature', 750),
      status: 'missing-branch',
    },
  ]

  printBranchComparison(comparisons, 'feature', 'main', log)

  const output = lines.join('\n')
  assert.match(output, /main: n\/a/)
  assert.match(output, /new on feature/)
})

test('printBranchComparison includes both branch names in output', () => {
  const { lines, log } = captureLog()
  const comparisons: BranchCompareResult[] = [
    {
      name: 'fn',
      current: baseResult('fn', 1000),
      branch: baseResult('fn', 1000),
      pctChange: 0,
      status: 'unchanged',
    },
  ]

  printBranchComparison(comparisons, 'my-feature', 'release-2', log)

  const output = lines.join('\n')
  assert.match(output, /release-2/)
})

// ── compareAgainstBranch ─────────────────────────────────────────────────────

const noopLog = () => undefined

test('compareAgainstBranch runs benchmarks on both branches and returns comparisons', async () => {
  const gitCalls: string[] = []
  const runGit = async (args: string[]) => {
    gitCalls.push(args.join(' '))
    if (args[0] === 'branch') return 'feature'
    if (args[0] === 'status') return ''
    return ''
  }

  let callCount = 0
  const runBenchmarks = async (): Promise<BenchResult[]> => {
    callCount += 1
    return callCount === 1
      ? [{ name: 'fn', opsPerSec: 2000, avgMs: 0.5, p99Ms: 1 }]
      : [{ name: 'fn', opsPerSec: 1000, avgMs: 1, p99Ms: 2 }]
  }

  const results = await compareAgainstBranch('src/', 'main', {
    findTargets: async () => [{ name: 'fn', file: 'src/bench.ts', line: 1, lang: 'js' as const, options: {} }],
    runBenchmarks,
    runGit,
    log: noopLog,
  })

  assert.equal(results.length, 1)
  assert.equal(results[0].name, 'fn')
  assert.equal(results[0].status, 'improved')

  assert.ok(gitCalls.includes('checkout main'), 'should checkout target branch')
  assert.ok(gitCalls.includes('checkout feature'), 'should restore original branch')
})

test('compareAgainstBranch stashes local changes before switching branches', async () => {
  const gitCalls: string[] = []
  const runGit = async (args: string[]) => {
    gitCalls.push(args.join(' '))
    if (args[0] === 'branch') return 'feature'
    if (args[0] === 'status') return 'M src/something.ts'
    return ''
  }

  await compareAgainstBranch('src/', 'main', {
    findTargets: async () => [],
    runBenchmarks: async () => [],
    runGit,
    log: noopLog,
  })

  assert.ok(
    gitCalls.some(c => c.startsWith('stash push')),
    'should stash when local changes present',
  )
  assert.ok(gitCalls.includes('stash pop'), 'should pop stash after switching back')
})

test('compareAgainstBranch does not stash when working tree is clean', async () => {
  const gitCalls: string[] = []
  const runGit = async (args: string[]) => {
    gitCalls.push(args.join(' '))
    if (args[0] === 'branch') return 'feature'
    if (args[0] === 'status') return ''
    return ''
  }

  await compareAgainstBranch('src/', 'main', {
    findTargets: async () => [],
    runBenchmarks: async () => [],
    runGit,
    log: noopLog,
  })

  assert.ok(!gitCalls.some(c => c.startsWith('stash')), 'should not stash when clean')
})

test('compareAgainstBranch restores original branch even when benchmark throws', async () => {
  const gitCalls: string[] = []
  const runGit = async (args: string[]) => {
    gitCalls.push(args.join(' '))
    if (args[0] === 'branch') return 'feature'
    if (args[0] === 'status') return ''
    return ''
  }

  let callCount = 0
  const runBenchmarks = async (): Promise<BenchResult[]> => {
    callCount += 1
    if (callCount === 2) throw new Error('benchmark process crashed')
    return []
  }

  await assert.rejects(
    () =>
      compareAgainstBranch('src/', 'main', {
        findTargets: async () => [{ name: 'fn', file: 'src/bench.ts', line: 1, lang: 'js' as const, options: {} }],
        runBenchmarks,
        runGit,
        log: noopLog,
      }),
    /benchmark process crashed/,
  )

  assert.ok(gitCalls.includes('checkout feature'), 'should restore branch even after error')
})

test('compareAgainstBranch restores stash even when benchmark throws', async () => {
  const gitCalls: string[] = []
  const runGit = async (args: string[]) => {
    gitCalls.push(args.join(' '))
    if (args[0] === 'branch') return 'feature'
    if (args[0] === 'status') return 'M dirty.ts'
    return ''
  }

  let callCount = 0
  const runBenchmarks = async (): Promise<BenchResult[]> => {
    callCount += 1
    if (callCount === 2) throw new Error('crash')
    return []
  }

  await assert.rejects(
    () =>
      compareAgainstBranch('src/', 'main', {
        findTargets: async () => [{ name: 'fn', file: 'src/bench.ts', line: 1, lang: 'js' as const, options: {} }],
        runBenchmarks,
        runGit,
        log: noopLog,
      }),
    /crash/,
  )

  assert.ok(gitCalls.includes('stash pop'), 'should pop stash even after error')
})

test('compareAgainstBranch logs an informational message per branch run', async () => {
  const logLines: string[] = []
  const runGit = async (args: string[]) => {
    if (args[0] === 'branch') return 'feature'
    if (args[0] === 'status') return ''
    return ''
  }

  await compareAgainstBranch('src/', 'main', {
    findTargets: async () => [],
    runBenchmarks: async () => [],
    runGit,
    log: (...args: unknown[]) => logLines.push(args.join(' ')),
  })

  assert.ok(logLines.some(l => l.includes('feature')), 'should log current branch name')
  assert.ok(logLines.some(l => l.includes('main')), 'should log target branch name')
})
