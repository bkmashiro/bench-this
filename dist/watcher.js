import { watch } from 'node:fs';
export function formatWatchTimestamp(date = new Date()) {
    return date.toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}
export function createDebouncedCallback(callback, delayMs, deps = {}) {
    const setTimer = deps.setTimer ?? ((fn, ms) => {
        const timeout = setTimeout(fn, ms);
        return {
            cancel: () => clearTimeout(timeout),
        };
    });
    let timer = null;
    return () => {
        timer?.cancel();
        timer = setTimer(() => {
            timer = null;
            void callback();
        }, delayMs);
    };
}
export function watchBenchmarks(directory, runBenchmarks, options = {}) {
    const watchFn = options.watchFn ?? watch;
    const log = options.log ?? console.log;
    const now = options.now ?? (() => new Date());
    const debounceMs = options.debounceMs ?? 200;
    let latestFile = '';
    let isRunning = false;
    let rerunRequested = false;
    const runDebounced = createDebouncedCallback(async () => {
        if (isRunning) {
            rerunRequested = true;
            return;
        }
        isRunning = true;
        try {
            log(`[${formatWatchTimestamp(now())}] Change detected: ${latestFile}`);
            log('Running affected benchmarks...');
            await runBenchmarks();
            log(`[${formatWatchTimestamp(now())}] Done. Next run on change...`);
        }
        finally {
            isRunning = false;
            if (rerunRequested) {
                rerunRequested = false;
                runDebounced();
            }
        }
    }, debounceMs, options);
    const watcher = watchFn(directory, { recursive: true }, (_eventType, filename) => {
        latestFile = typeof filename === 'string' && filename.length > 0 ? filename : directory;
        runDebounced();
    });
    log(`Watching ${directory} for changes... (Ctrl+C to stop)`);
    return watcher;
}
