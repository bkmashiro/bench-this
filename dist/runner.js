import { Bench } from 'tinybench';
import { pathToFileURL } from 'url';
import { readFileSync } from 'fs';
import { extname, join } from 'path';
export async function runBenchmark(target) {
    try {
        const mod = await loadBenchmarkModule(target.file);
        // Find the function - try the display name or scan for @bench targets
        // We need to match by original function name, not label
        const funcName = getFuncName(target);
        const defaultExport = mod.default;
        const fn = mod[funcName] || defaultExport?.[funcName];
        if (!fn || typeof fn !== 'function') {
            console.error(`  Could not find function "${funcName}" in ${target.file}`);
            return null;
        }
        const bench = new Bench({
            iterations: target.options.iterations ?? 100,
            warmupIterations: 10,
        });
        let inputValue;
        if (target.options.input) {
            try {
                inputValue = eval(target.options.input);
            }
            catch {
                inputValue = target.options.input;
            }
        }
        bench.add(target.name, () => {
            if (inputValue !== undefined) {
                fn(inputValue);
            }
            else {
                fn();
            }
        });
        await bench.run();
        const task = bench.tasks[0];
        if (!task?.result)
            return null;
        // tinybench v6 changed the result structure
        const result = task.result;
        const opsPerSec = result.throughput?.mean ?? 0;
        const avgMs = result.latency?.mean ?? 0;
        const p99Ms = result.latency?.p99 ?? 0;
        return {
            name: target.name,
            opsPerSec,
            avgMs,
            p99Ms,
        };
    }
    catch (err) {
        console.error(`  Error running benchmark "${target.name}":`, err);
        return null;
    }
}
async function loadBenchmarkModule(file) {
    const fileUrl = pathToFileURL(file).href;
    if (['.ts', '.tsx', '.mts', '.cts'].includes(extname(file))) {
        const { tsImport } = await import('tsx/esm/api');
        const parentUrl = pathToFileURL(join(process.cwd(), '__bench-this_runner__.mjs')).href;
        return tsImport(fileUrl, parentUrl);
    }
    return import(fileUrl);
}
function getFuncName(target) {
    // If there's a label, we stored the label as name; need to find actual func name
    // Re-extract from file to get the real function name
    const content = readFileSync(target.file, 'utf-8');
    const BENCH_PATTERN = /\/\/\s*@bench([^\n]*)\n\s*((?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/gm;
    let match;
    while ((match = BENCH_PATTERN.exec(content)) !== null) {
        const optStr = match[1] || '';
        const funcName = match[3] || match[4];
        const labelMatch = optStr.match(/label\s*=\s*"([^"]*)"/);
        const nameMatch = optStr.match(/name\s*=\s*"([^"]*)"/);
        const label = labelMatch?.[1] ?? nameMatch?.[1];
        if (label === target.name || funcName === target.name) {
            return funcName;
        }
    }
    return target.name;
}
export async function runAll(targets) {
    const results = [];
    for (const target of targets) {
        const result = await runBenchmark(target);
        if (result)
            results.push(result);
    }
    return results;
}
