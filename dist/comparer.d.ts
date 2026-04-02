import { findBenchTargets } from './extractor.js';
import { runAll, type BenchResult } from './runner.js';
export interface BranchCompareResult {
    name: string;
    current?: BenchResult;
    branch?: BenchResult;
    pctChange?: number;
    status: 'improved' | 'regression' | 'missing-current' | 'missing-branch' | 'unchanged';
}
export interface CompareBranchesDependencies {
    findTargets?: typeof findBenchTargets;
    runBenchmarks?: typeof runAll;
    runGit?: (args: string[]) => Promise<string>;
    log?: (...args: unknown[]) => void;
}
export declare function diffBenchmarkResults(currentResults: BenchResult[], branchResults: BenchResult[]): BranchCompareResult[];
export declare function printBranchComparison(comparisons: BranchCompareResult[], currentBranch: string, targetBranch: string, log?: (...args: unknown[]) => void): void;
export declare function compareAgainstBranch(searchPath: string, targetBranch: string, deps?: CompareBranchesDependencies): Promise<BranchCompareResult[]>;
