export interface SampleSummary {
    mean: number;
    standardDeviation: number;
}
export interface SignificanceResult {
    mean1: number;
    mean2: number;
    standardDeviation1: number;
    standardDeviation2: number;
    tValue: number;
    pValue: number;
    deltaPct: number;
    isSignificant: boolean;
}
export declare function mean(samples: number[]): number;
export declare function standardDeviation(samples: number[]): number;
export declare function summarizeSamples(samples: number[]): SampleSummary;
export declare function calculateTValue(mean1: number, sd1: number, n1: number, mean2: number, sd2: number, n2: number): number;
export declare function approximatePValue(tValue: number): number;
export declare function compareSamples(samples1: number[], samples2: number[]): SignificanceResult;
