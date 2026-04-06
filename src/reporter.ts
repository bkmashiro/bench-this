import chalk from 'chalk'
import type { BenchResult } from './runner.js'
import type { ProfileResult } from './runner.js'
import type { Baseline } from './baseline.js'
import type { SignificanceResult } from './stats.js'

export interface CompareResult {
  result: BenchResult
  baseline?: { opsPerSec: number; avgMs: number; savedAt: string }
  pctChange?: number
  isRegression: boolean
}

/**
 * Compares benchmark results against a saved baseline and flags regressions.
 *
 * @param results - The current benchmark results to evaluate.
 * @param baseline - The saved baseline to compare against, keyed by benchmark name.
 * @param threshold - The percentage drop in ops/sec that constitutes a regression.
 *   For example, `10` means a 10% slowdown triggers a regression flag.
 * @returns An array of comparison entries, each pairing a result with its baseline
 *   data, percentage change, and regression status.
 */
export function compare(results: BenchResult[], baseline: Baseline, threshold: number): CompareResult[] {
  return results.map(result => {
    const base = baseline[result.name]
    if (!base) {
      return { result, isRegression: false }
    }
    const pctChange = base.opsPerSec === 0
      ? undefined
      : ((result.opsPerSec - base.opsPerSec) / base.opsPerSec) * 100
    return {
      result,
      baseline: base,
      pctChange,
      isRegression: pctChange !== undefined && pctChange < -threshold,
    }
  })
}

function fmtOps(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function fmtMs(n: number): string {
  return n.toFixed(3) + 'ms'
}

function getStatus(pctChange: number, threshold: number): 'regression' | 'improvement' | 'stable' {
  if (pctChange < -threshold) return 'regression'
  if (pctChange > threshold) return 'improvement'
  return 'stable'
}

/**
 * Prints a formatted benchmark comparison report to stdout.
 *
 * Each benchmark entry is printed with its current throughput in ops/sec and
 * average latency in milliseconds. When a baseline is available, the percentage
 * change is shown and regressions are highlighted in red.
 *
 * @param comparisons - The comparison entries produced by {@link compare}.
 * @param json - When `true`, emits raw JSON instead of the human-readable table.
 * @param threshold - The percentage change threshold for classifying regressions/improvements.
 */
export function printReport(comparisons: CompareResult[], json = false, threshold = 10): void {
  if (json) {
    console.log(JSON.stringify(comparisons, null, 2))
    return
  }

  console.log()
  console.log(chalk.bold('bench-this results'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log()

  const regressions = comparisons.filter(c => c.isRegression)

  for (const c of comparisons) {
    const { result, baseline, pctChange, isRegression } = c

    console.log(
      chalk.bold(`  ${result.name.padEnd(20)}`),
      chalk.cyan(`${fmtOps(result.opsPerSec)} ops/s`),
      chalk.dim(`  ${fmtMs(result.avgMs)} avg`)
    )

    if (baseline !== undefined && pctChange !== undefined) {
      const sign = pctChange >= 0 ? '+' : ''
      const pctStr = `${sign}${pctChange.toFixed(1)}%`
      const status = getStatus(pctChange, threshold)

      if (status === 'regression') {
        console.log(
          chalk.dim(`    vs baseline:`),
          chalk.dim(`${fmtOps(baseline.opsPerSec)} ops/s`),
          chalk.red(`  ⚠️  ${pctStr} regression`)
        )
      } else if (status === 'improvement') {
        console.log(
          chalk.dim(`    vs baseline:`),
          chalk.dim(`${fmtOps(baseline.opsPerSec)} ops/s`),
          chalk.green(`  ✅  ${pctStr} improvement`)
        )
      } else {
        console.log(
          chalk.dim(`    vs baseline:`),
          chalk.dim(`${fmtOps(baseline.opsPerSec)} ops/s`),
          chalk.green(`  ✅  ${pctStr} stable`)
        )
      }
    } else {
      console.log(chalk.dim(`    first run  💡 Run \`bench-this save\` to set baseline`))
    }

    console.log()
  }

  console.log(chalk.dim('─'.repeat(50)))

  if (regressions.length > 0) {
    console.log(chalk.red(`\n${regressions.length} regression${regressions.length > 1 ? 's' : ''} found. Run \`bench-this save\` to update baseline.`))
  } else if (comparisons.some(c => c.baseline)) {
    console.log(chalk.green('\nAll benchmarks within threshold.'))
  }
  console.log()
}

/**
 * Prints a formatted list of discovered benchmark targets to stdout.
 *
 * Each entry shows the function name, source file, and line number. Optional
 * per-benchmark settings such as `iterations` and `input` are shown when present.
 *
 * @param targets - The benchmark targets discovered by the extractor.
 */
export function printList(targets: import('./extractor.js').BenchTarget[]): void {
  console.log()
  console.log(chalk.bold('bench-this — annotated functions'))
  console.log(chalk.dim('─'.repeat(50)))
  console.log()

  for (const t of targets) {
    console.log(
      chalk.cyan(`  ${t.name.padEnd(25)}`),
      chalk.dim(`${t.file}:${t.line}`)
    )
    if (t.options.iterations) {
      console.log(chalk.dim(`    iterations: ${t.options.iterations}`))
    }
    if (t.options.input) {
      console.log(chalk.dim(`    input: ${t.options.input}`))
    }
  }

  console.log()
  console.log(chalk.dim(`${targets.length} function${targets.length !== 1 ? 's' : ''} found`))
  console.log()
}

export interface StatsReportEntry {
  name: string
  current: BenchResult
  baseline?: { opsPerSec: number; samples?: number[] }
  significance?: SignificanceResult
}

/**
 * Prints a CPU profile report for one or more benchmark functions to stdout.
 *
 * For each result, the top-3 hotspots are listed with their percentage of total
 * CPU time, file location, and a marker when the frame belongs to user code.
 * An optional suggestion is shown when the profiler identifies a likely cause.
 *
 * @param results - The profiling results collected by the runner.
 */
export function printProfileReport(results: ProfileResult[]): void {
  for (const result of results) {
    console.log(`Profiling ${result.name}...`)
    console.log(`  Total time: ${(result.totalTimeMs / 1000).toFixed(1)}s`)
    console.log()
    console.log('  Hotspots:')

    if (result.hotspots.length === 0) {
      console.log('    No JavaScript hotspots collected from V8 for this run.')
    }

    for (const hotspot of result.hotspots.slice(0, 3)) {
      const location = hotspot.file && hotspot.line ? ` (${hotspot.file}:${hotspot.line})` : ''
      const marker = hotspot.isUserCode ? '  <- your function' : ''
      console.log(`    ${hotspot.name.padEnd(22)} ${hotspot.percentage.toFixed(0)}%${location}${marker}`)
    }

    if (result.suggestion) {
      console.log()
      console.log(`  Suggestion: ${result.suggestion}`)
    }

    console.log()
  }
}

/**
 * Prints a statistical significance report comparing current results to a baseline.
 *
 * For each entry, throughput in ops/sec is shown for both the current run and the
 * saved baseline. When significance data is available, the percentage delta and
 * p-value are reported, with a clear label indicating whether the difference is
 * statistically significant (p &lt; 0.05) or likely measurement noise.
 *
 * @param entries - The report entries, each combining a benchmark result with its
 *   optional baseline and significance test outcome.
 */
export function printStatsReport(entries: StatsReportEntry[]): void {
  for (const entry of entries) {
    const currentOps = fmtOps(entry.current.opsPerSec)
    const baselineOps = entry.baseline ? fmtOps(entry.baseline.opsPerSec) : 'n/a'
    console.log(`${entry.name}: current ${currentOps} ops/sec vs baseline ${baselineOps} ops/sec`)

    if (!entry.baseline) {
      console.log('  No baseline entry found.')
      console.log()
      continue
    }

    if (!entry.significance) {
      console.log('  Missing repeated samples in baseline; re-save the baseline to enable significance testing.')
      console.log()
      continue
    }

    const deltaSign = entry.significance.deltaPct >= 0 ? '+' : ''
    const significanceLabel = entry.significance.isSignificant
      ? 'statistically significant (p < 0.05)'
      : 'NOT significant (likely noise)'
    const indicator = entry.significance.isSignificant ? '✅' : '⚠'

    console.log(
      `  Δ = ${deltaSign}${entry.significance.deltaPct.toFixed(1)}%  p-value = ${entry.significance.pValue.toFixed(3)} ${indicator} ${significanceLabel}`,
    )
    console.log()
  }
}
