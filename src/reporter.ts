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

export function compare(results: BenchResult[], baseline: Baseline, threshold: number): CompareResult[] {
  return results.map(result => {
    const base = baseline[result.name]
    if (!base) {
      return { result, isRegression: false }
    }
    const pctChange = ((result.opsPerSec - base.opsPerSec) / base.opsPerSec) * 100
    return {
      result,
      baseline: base,
      pctChange,
      isRegression: pctChange < -threshold,
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

export function printReport(comparisons: CompareResult[], json = false): void {
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
      const status = getStatus(pctChange, 20)

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
