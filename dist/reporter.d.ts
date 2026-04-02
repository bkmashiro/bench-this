import type { BenchResult } from './runner.js';
import type { ProfileResult } from './runner.js';
import type { Baseline } from './baseline.js';
import type { SignificanceResult } from './stats.js';
export interface CompareResult {
    result: BenchResult;
    baseline?: {
        opsPerSec: number;
        avgMs: number;
        savedAt: string;
    };
    pctChange?: number;
    isRegression: boolean;
}
export declare function compare(results: BenchResult[], baseline: Baseline, threshold: number): CompareResult[];
export declare function printReport(comparisons: CompareResult[], json?: boolean): void;
export declare function printList(targets: import('./extractor.js').BenchTarget[]): void;
export interface StatsReportEntry {
    name: string;
    current: BenchResult;
    baseline?: {
        opsPerSec: number;
        samples?: number[];
    };
    significance?: SignificanceResult;
}
export declare function printProfileReport(results: ProfileResult[]): void;
export declare function printStatsReport(entries: StatsReportEntry[]): void;
