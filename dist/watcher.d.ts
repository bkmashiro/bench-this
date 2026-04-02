import { watch, type FSWatcher } from 'node:fs';
export interface WatcherTimer {
    cancel(): void;
}
export interface WatcherDependencies {
    watchFn?: typeof watch;
    now?: () => Date;
    setTimer?: (callback: () => void, delayMs: number) => WatcherTimer;
    log?: (...args: unknown[]) => void;
}
export declare function formatWatchTimestamp(date?: Date): string;
export declare function createDebouncedCallback(callback: () => void | Promise<void>, delayMs: number, deps?: Pick<WatcherDependencies, 'setTimer'>): () => void;
export interface WatchBenchmarksOptions extends WatcherDependencies {
    debounceMs?: number;
}
export declare function watchBenchmarks(directory: string, runBenchmarks: () => void | Promise<void>, options?: WatchBenchmarksOptions): FSWatcher;
