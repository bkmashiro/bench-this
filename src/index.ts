#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { program } from 'commander'
import { findBenchTargets } from './extractor.js'
import { profileAll, runAll, runAllWithSamples } from './runner.js'
import { loadBaseline, loadBaselineFile, saveBaseline } from './baseline.js'
import { compare, printList, printProfileReport, printReport, printStatsReport } from './reporter.js'
import { watchBenchmarks } from './watcher.js'
import { compareAgainstBranch } from './comparer.js'
import { compareSamples } from './stats.js'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

function parseLangs(langOpt: string | undefined): ('js' | 'py')[] {
  if (!langOpt) return ['js', 'py']
  return langOpt.split(',').map(s => s.trim()).filter((s): s is 'js' | 'py' => s === 'js' || s === 'py')
}

async function runBenchmarksWithBaseline(searchPath: string, opts: { threshold: string; json?: boolean; ci?: boolean; lang?: string }): Promise<void> {
  const targets = await findBenchTargets(searchPath, parseLangs(opts.lang))
  if (targets.length === 0) {
    console.log('No @bench annotated functions found.')
    process.exit(0)
  }

  console.log(`Running ${targets.length} benchmark${targets.length !== 1 ? 's' : ''}...`)
  const results = await runAll(targets)
  const baseline = loadBaseline() ?? {}
  const threshold = parseFloat(opts.threshold)
  const comparisons = compare(results, baseline, threshold)

  printReport(comparisons, opts.json)

  if (opts.ci && comparisons.some(c => c.isRegression)) {
    process.exit(1)
  }
}

async function runProfiling(searchPath: string, langs?: ('js' | 'py')[]): Promise<void> {
  const targets = await findBenchTargets(searchPath, langs)
  if (targets.length === 0) {
    console.log('No @bench annotated functions found.')
    process.exit(0)
  }

  const results = await profileAll(targets)
  printProfileReport(results)
}

async function runStatisticalComparison(searchPath: string, baselinePath: string, langs?: ('js' | 'py')[]): Promise<void> {
  const targets = await findBenchTargets(searchPath, langs)
  if (targets.length === 0) {
    console.log('No @bench annotated functions found.')
    process.exit(0)
  }

  const baseline = loadBaselineFile(resolve(baselinePath))
  if (baseline === null) {
    console.error(`Could not read baseline file: ${baselinePath}`)
    process.exit(1)
  }

  console.log(`Running ${targets.length} benchmark${targets.length !== 1 ? 's' : ''} with 10 samples each...`)
  const currentResults = await runAllWithSamples(targets, 10)
  const entries = currentResults.map(result => {
    const baselineEntry = baseline[result.name]
    const significance = baselineEntry?.samples && result.samples
      ? compareSamples(result.samples, baselineEntry.samples)
      : undefined

    return {
      name: result.name,
      current: result,
      baseline: baselineEntry,
      significance,
    }
  })

  printStatsReport(entries)
}

program
  .name('bench-this')
  .description('Run @bench annotated functions and track regressions')
  .version(packageJson.version)
  .argument('[path]', 'File, directory, or glob to benchmark', '.')
  .option('--threshold <n>', 'Regression threshold %', '10')
  .option('--json', 'JSON output')
  .option('--ci', 'Exit code 1 on regression')
  .option('--watch [dir]', 'Watch a directory and re-run benchmarks on changes')
  .option('--compare <branch>', 'Compare benchmarks against another git branch')
  .option('--profile', 'Run V8 CPU profiling and show hotspots')
  .option('--stats <baseline>', 'Compare repeated benchmark samples against a baseline JSON file')
  .option('--lang <langs>', 'Comma-separated languages to benchmark: js,py (default: auto-detect)')
  .action(async (searchPath, opts) => {
    if ([opts.watch !== undefined, Boolean(opts.compare), Boolean(opts.profile), Boolean(opts.stats)].filter(Boolean).length > 1) {
      console.error('Use only one of --watch, --compare, --profile, or --stats at a time.')
      process.exit(1)
    }

    const langs = parseLangs(opts.lang)

    if (opts.compare) {
      await compareAgainstBranch(searchPath, opts.compare)
      return
    }

    if (opts.watch !== undefined) {
      const watchPath = typeof opts.watch === 'string' ? opts.watch : searchPath
      const watcher = watchBenchmarks(watchPath, () => runBenchmarksWithBaseline(searchPath, opts))

      process.once('SIGINT', () => {
        watcher.close()
        process.exit(0)
      })
      return
    }

    if (opts.profile) {
      await runProfiling(searchPath, langs)
      return
    }

    if (opts.stats) {
      await runStatisticalComparison(searchPath, opts.stats, langs)
      return
    }

    await runBenchmarksWithBaseline(searchPath, opts)
  })

program
  .command('run [path]')
  .description('Run all @bench functions and compare to baseline')
  .option('--threshold <n>', 'Regression threshold %', '10')
  .option('--json', 'JSON output')
  .option('--ci', 'Exit code 1 on regression')
  .option('--profile', 'Run V8 CPU profiling and show hotspots')
  .option('--stats <baseline>', 'Compare repeated benchmark samples against a baseline JSON file')
  .option('--lang <langs>', 'Comma-separated languages to benchmark: js,py (default: auto-detect)')
  .action(async (searchPath = '.', opts) => {
    if (opts.profile && opts.stats) {
      console.error('Cannot use --profile and --stats together.')
      process.exit(1)
    }

    const langs = parseLangs(opts.lang)

    if (opts.profile) {
      await runProfiling(searchPath, langs)
      return
    }

    if (opts.stats) {
      await runStatisticalComparison(searchPath, opts.stats, langs)
      return
    }

    await runBenchmarksWithBaseline(searchPath, opts)
  })

program
  .command('save [path]')
  .description('Run benchmarks and save as new baseline')
  .option('--lang <langs>', 'Comma-separated languages to benchmark: js,py (default: auto-detect)')
  .action(async (searchPath = '.', opts) => {
    const targets = await findBenchTargets(searchPath, parseLangs(opts.lang))
    if (targets.length === 0) {
      console.log('No @bench annotated functions found.')
      process.exit(0)
    }

    console.log(`Running ${targets.length} benchmark${targets.length !== 1 ? 's' : ''} with 10 samples each...`)
    const results = await runAllWithSamples(targets, 10)
    saveBaseline(results)
    console.log(`Saved ${results.length} results to .bench-baseline.json`)
  })

program
  .command('list [path]')
  .description('List all @bench annotated functions')
  .option('--lang <langs>', 'Comma-separated languages to benchmark: js,py (default: auto-detect)')
  .action(async (searchPath = '.', opts) => {
    const targets = await findBenchTargets(searchPath, parseLangs(opts.lang))
    printList(targets)
  })

program
  .command('compare')
  .description('Show current vs baseline table')
  .option('--threshold <n>', 'Regression threshold %', '10')
  .option('--json', 'JSON output')
  .action(async (opts) => {
    const baseline = loadBaseline()
    if (baseline === null || Object.keys(baseline).length === 0) {
      console.log('No baseline found. Run `bench-this save` first.')
      process.exit(0)
    }

    // Show baseline data as-is
    if (opts.json) {
      console.log(JSON.stringify(baseline, null, 2))
      return
    }

    console.log('\nBaseline data:')
    for (const [name, entry] of Object.entries(baseline)) {
      console.log(`  ${name}: ${entry.opsPerSec.toLocaleString()} ops/s (saved ${entry.savedAt})`)
    }
    console.log()
  })

program.parse()
