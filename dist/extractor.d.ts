export interface BenchTarget {
    name: string;
    file: string;
    line: number;
    options: {
        label?: string;
        iterations?: number;
        input?: string;
    };
}
export declare function extractBenchTargets(filePath: string): BenchTarget[];
export declare function findBenchTargets(searchPath: string): Promise<BenchTarget[]>;
export declare function findBenchTargetsByGlob(patterns: string | string[], cwd?: string): Promise<BenchTarget[]>;
