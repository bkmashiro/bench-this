import type { BenchResult } from './runner.js';
import type { Baseline } from './baseline.js';
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
