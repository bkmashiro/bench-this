import { readFileSync, writeFileSync, existsSync } from 'fs'
import * as path from 'path'
import type { BenchResult } from './runner.js'

const BASELINE_FILE = '.bench-baseline.json'

export interface BaselineEntry {
  opsPerSec: number
  avgMs: number
  savedAt: string
  samples?: number[]
  stdDevOpsPerSec?: number
}

export type Baseline = Record<string, BaselineEntry>

/**
 * Loads the baseline from the default `.bench-baseline.json` file in the given directory.
 *
 * @param cwd - Directory to look in. Defaults to `process.cwd()`.
 * @returns The parsed {@link Baseline} record, or `null` if the file does not exist or is invalid JSON.
 */
export function loadBaseline(cwd = process.cwd()): Baseline | null {
  return loadBaselineFile(path.join(cwd, BASELINE_FILE))
}

/**
 * Loads a baseline from an arbitrary file path.
 *
 * @param filePath - Absolute path to a JSON baseline file.
 * @returns The parsed {@link Baseline} record, or `null` if the file does not exist or contains invalid JSON.
 */
export function loadBaselineFile(filePath: string): Baseline | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Merges benchmark results into the `.bench-baseline.json` file, creating it if necessary.
 *
 * Existing entries for other benchmarks are preserved; only entries present in `results` are
 * updated. The `savedAt` field is set to today's date in `YYYY-MM-DD` format.
 *
 * @param results - Array of benchmark results to persist.
 * @param cwd - Directory containing the baseline file. Defaults to `process.cwd()`.
 * @throws {Error} If the file cannot be written (e.g. permission denied).
 */
export function saveBaseline(results: BenchResult[], cwd = process.cwd()): void {
  const filePath = path.join(cwd, BASELINE_FILE)
  const existing = loadBaseline(cwd) ?? {}

  for (const r of results) {
    existing[r.name] = {
      opsPerSec: r.opsPerSec,
      avgMs: r.avgMs,
      savedAt: new Date().toISOString().split('T')[0],
      samples: r.samples,
      stdDevOpsPerSec: r.stdDevOpsPerSec,
    }
  }

  writeFileSync(filePath, JSON.stringify(existing, null, 2))
}
