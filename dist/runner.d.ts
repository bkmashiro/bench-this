import type { BenchTarget } from './extractor.js';
export interface BenchResult {
    name: string;
    opsPerSec: number;
    avgMs: number;
    p99Ms: number;
}
export declare function runBenchmark(target: BenchTarget): Promise<BenchResult | null>;
export declare function runAll(targets: BenchTarget[]): Promise<BenchResult[]>;
