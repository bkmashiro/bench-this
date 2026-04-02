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

export function loadBaseline(cwd = process.cwd()): Baseline | null {
  return loadBaselineFile(path.join(cwd, BASELINE_FILE))
}

export function loadBaselineFile(filePath: string): Baseline | null {
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

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
