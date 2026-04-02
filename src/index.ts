#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { program } from 'commander'
import { findBenchTargets } from './extractor.js'
import { runAll } from './runner.js'
import { loadBaseline, saveBaseline } from './baseline.js'
import { compare, printReport, printList } from './reporter.js'
import { watchBenchmarks } from './watcher.js'
import { compareAgainstBranch } from './comparer.js'

const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }

async function runBenchmarksWithBaseline(searchPath: string, opts: { threshold: string; json?: boolean; ci?: boolean }): Promise<void> {
  const targets = await findBenchTargets(searchPath)
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
  .action(async (searchPath, opts) => {
    if (opts.watch !== undefined && opts.compare) {
      console.error('Cannot use --watch and --compare together.')
      process.exit(1)
    }

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

    await runBenchmarksWithBaseline(searchPath, opts)
  })

program
  .command('run [path]')
  .description('Run all @bench functions and compare to baseline')
  .option('--threshold <n>', 'Regression threshold %', '10')
  .option('--json', 'JSON output')
  .option('--ci', 'Exit code 1 on regression')
  .action(async (searchPath = '.', opts) => {
    await runBenchmarksWithBaseline(searchPath, opts)
  })

program
  .command('save [path]')
  .description('Run benchmarks and save as new baseline')
  .action(async (searchPath = '.') => {
    const targets = await findBenchTargets(searchPath)
    if (targets.length === 0) {
      console.log('No @bench annotated functions found.')
      process.exit(0)
    }

    console.log(`Running ${targets.length} benchmark${targets.length !== 1 ? 's' : ''}...`)
    const results = await runAll(targets)
    saveBaseline(results)
    console.log(`Saved ${results.length} results to .bench-baseline.json`)
  })

program
  .command('list [path]')
  .description('List all @bench annotated functions')
  .action(async (searchPath = '.') => {
    const targets = await findBenchTargets(searchPath)
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
