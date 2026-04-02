import type { BenchTarget } from './extractor.js';
export interface BenchResult {
    name: string;
    opsPerSec: number;
    avgMs: number;
    p99Ms: number;
    samples?: number[];
    stdDevOpsPerSec?: number;
}
export interface ProfileHotspot {
    name: string;
    percentage: number;
    file?: string;
    line?: number;
    isUserCode: boolean;
}
export interface ProfileResult {
    name: string;
    totalTimeMs: number;
    hotspots: ProfileHotspot[];
    suggestion?: string;
}
export declare function runBenchmark(target: BenchTarget): Promise<BenchResult | null>;
export declare function runBenchmarkWithSamples(target: BenchTarget, sampleCount?: number): Promise<BenchResult | null>;
export declare function runAll(targets: BenchTarget[]): Promise<BenchResult[]>;
export declare function runAllWithSamples(targets: BenchTarget[], sampleCount?: number): Promise<BenchResult[]>;
export declare function profileBenchmark(target: BenchTarget, durationMs?: number): Promise<ProfileResult | null>;
export declare function profileAll(targets: BenchTarget[], durationMs?: number): Promise<ProfileResult[]>;
