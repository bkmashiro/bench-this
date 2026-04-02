import type { BenchResult } from './runner.js';
export interface BaselineEntry {
    opsPerSec: number;
    avgMs: number;
    savedAt: string;
}
export type Baseline = Record<string, BaselineEntry>;
export declare function loadBaseline(cwd?: string): Baseline | null;
export declare function saveBaseline(results: BenchResult[], cwd?: string): void;
