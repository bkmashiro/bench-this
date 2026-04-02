import { watch, type FSWatcher } from 'node:fs'

export interface WatcherTimer {
  cancel(): void
}

export interface WatcherDependencies {
  watchFn?: typeof watch
  now?: () => Date
  setTimer?: (callback: () => void, delayMs: number) => WatcherTimer
  log?: (...args: unknown[]) => void
}

export function formatWatchTimestamp(date = new Date()): string {
  return date.toLocaleTimeString('en-GB', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function createDebouncedCallback(
  callback: () => void | Promise<void>,
  delayMs: number,
  deps: Pick<WatcherDependencies, 'setTimer'> = {},
): () => void {
  const setTimer = deps.setTimer ?? ((fn, ms) => {
    const timeout = setTimeout(fn, ms)
    return {
      cancel: () => clearTimeout(timeout),
    }
  })

  let timer: WatcherTimer | null = null

  return () => {
    timer?.cancel()
    timer = setTimer(() => {
      timer = null
      void callback()
    }, delayMs)
  }
}

export interface WatchBenchmarksOptions extends WatcherDependencies {
  debounceMs?: number
}

export function watchBenchmarks(
  directory: string,
  runBenchmarks: () => void | Promise<void>,
  options: WatchBenchmarksOptions = {},
): FSWatcher {
  const watchFn = options.watchFn ?? watch
  const log = options.log ?? console.log
  const now = options.now ?? (() => new Date())
  const debounceMs = options.debounceMs ?? 200

  let latestFile = ''
  let isRunning = false
  let rerunRequested = false

  const runDebounced = createDebouncedCallback(async () => {
    if (isRunning) {
      rerunRequested = true
      return
    }

    isRunning = true

    try {
      log(`[${formatWatchTimestamp(now())}] Change detected: ${latestFile}`)
      log('Running affected benchmarks...')
      await runBenchmarks()
      log(`[${formatWatchTimestamp(now())}] Done. Next run on change...`)
    } finally {
      isRunning = false

      if (rerunRequested) {
        rerunRequested = false
        runDebounced()
      }
    }
  }, debounceMs, options)

  const watcher = watchFn(directory, { recursive: true }, (_eventType, filename) => {
    latestFile = typeof filename === 'string' && filename.length > 0 ? filename : directory
    runDebounced()
  })

  log(`Watching ${directory} for changes... (Ctrl+C to stop)`)
  return watcher
}
