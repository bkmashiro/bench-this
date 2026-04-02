import * as core from '@actions/core'
import * as github from '@actions/github'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { findBenchTargetsByGlob } from './extractor.js'
import { saveBaseline, type Baseline } from './baseline.js'
import { compare, type CompareResult } from './reporter.js'
import { runAll } from './runner.js'

const execFileAsync = promisify(execFile)

async function run(): Promise<void> {
  const threshold = parseNumberInput('threshold', 20)
  const filePatterns = parsePatterns(core.getInput('files') || 'src/**/*.ts')
  const baselineBranch = core.getInput('baseline-branch') || 'main'
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd()
  const baselineDir = mkdtempSync(join(tmpdir(), 'bench-this-baseline-'))
  let originalRef: string | null = null

  try {
    const refs = await prepareRefs(baselineBranch)
    originalRef = refs.originalRef
    const { currentRef, baselineRef } = refs
    const baselineResults = await checkoutAndRun(baselineRef, filePatterns, workspace)
    saveBaseline(baselineResults, baselineDir)

    const currentResults = await checkoutAndRun(currentRef, filePatterns, workspace)
    const baseline = toBaseline(baselineResults)
    const comparisons = compare(currentResults, baseline, threshold)
    const regressions = comparisons.filter(result => result.isRegression)

    await core.summary
      .addHeading('bench-this')
      .addRaw(renderMarkdownTable(comparisons, threshold), true)
      .write()

    await postPullRequestComment(comparisons, threshold)

    if (regressions.length > 0) {
      core.setFailed(
        `Detected ${regressions.length} performance regression${regressions.length === 1 ? '' : 's'} beyond ${threshold}%.`
      )
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.setFailed(message)
  } finally {
    if (originalRef) {
      try {
        await git(['checkout', '--force', originalRef], workspace)
      } catch {
        // Best effort cleanup only.
      }
    }
    rmSync(baselineDir, { recursive: true, force: true })
  }
}

async function prepareRefs(
  baselineBranch: string
): Promise<{ currentRef: string; baselineRef: string; originalRef: string }> {
  const originalRef = (await git(['rev-parse', 'HEAD'])).trim()
  const baselineRef = `origin/${baselineBranch}`

  await git(['fetch', '--no-tags', '--prune', 'origin', baselineBranch])

  const pullRequestHeadSha = github.context.payload.pull_request?.head?.sha
  if (pullRequestHeadSha) {
    await git(['fetch', '--no-tags', 'origin', pullRequestHeadSha])
  }

  return {
    currentRef: pullRequestHeadSha || originalRef,
    baselineRef,
    originalRef,
  }
}

async function checkoutAndRun(ref: string, filePatterns: string[], cwd: string) {
  await git(['checkout', '--force', ref], cwd)
  const targets = await findBenchTargetsByGlob(filePatterns, cwd)

  if (targets.length === 0) {
    throw new Error(`No @bench annotated functions found for: ${filePatterns.join(', ')}`)
  }

  core.info(`Running ${targets.length} benchmark${targets.length === 1 ? '' : 's'} for ${ref}`)
  return runAll(targets)
}

function toBaseline(results: Awaited<ReturnType<typeof runAll>>): Baseline {
  const savedAt = new Date().toISOString().slice(0, 10)
  return Object.fromEntries(
    results.map(result => [
      result.name,
      {
        opsPerSec: result.opsPerSec,
        avgMs: result.avgMs,
        savedAt,
      },
    ])
  )
}

async function postPullRequestComment(
  comparisons: CompareResult[],
  threshold: number
): Promise<void> {
  const pullRequest = github.context.payload.pull_request
  if (!pullRequest) {
    core.info('No pull request context detected; skipping PR comment.')
    return
  }

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    core.warning('No GitHub token available; skipping PR comment.')
    return
  }

  const octokit = github.getOctokit(token)
  const body = [
    '## bench-this results',
    '',
    renderMarkdownTable(comparisons, threshold),
  ].join('\n')

  await octokit.rest.issues.createComment({
    ...github.context.repo,
    issue_number: pullRequest.number,
    body,
  })
}

function renderMarkdownTable(comparisons: CompareResult[], threshold: number): string {
  const rows = [
    '| Benchmark | Baseline ops/s | Current ops/s | Change | Status |',
    '| --- | ---: | ---: | ---: | --- |',
  ]

  for (const comparison of comparisons) {
    const baselineOps = comparison.baseline ? formatOps(comparison.baseline.opsPerSec) : 'n/a'
    const currentOps = formatOps(comparison.result.opsPerSec)
    const change = comparison.pctChange === undefined ? 'n/a' : `${comparison.pctChange >= 0 ? '+' : ''}${comparison.pctChange.toFixed(1)}%`
    const status = comparison.baseline
      ? comparison.isRegression
        ? `regressed > ${threshold}%`
        : 'within threshold'
      : 'new benchmark'

    rows.push(`| ${comparison.result.name} | ${baselineOps} | ${currentOps} | ${change} | ${status} |`)
  }

  return rows.join('\n')
}

function formatOps(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function parsePatterns(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map(pattern => pattern.trim())
    .filter(Boolean)
}

function parseNumberInput(name: string, defaultValue: number): number {
  const raw = core.getInput(name) || String(defaultValue)
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${name} input: ${raw}`)
  }
  return parsed
}

async function git(args: string[], cwd = process.cwd()): Promise<string> {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd })
  if (stderr.trim()) {
    core.debug(stderr.trim())
  }
  return stdout.trim()
}

void run()
