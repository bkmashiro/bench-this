import { readFileSync } from 'fs';
import { glob } from 'glob';
import * as path from 'path';
const BENCH_PATTERN = /\/\/\s*@bench([^\n]*)\n\s*((?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\()/gm;
function parseOptions(optStr) {
    const opts = {};
    const labelMatch = optStr.match(/label\s*=\s*"([^"]*)"/);
    if (labelMatch)
        opts.label = labelMatch[1];
    const nameMatch = optStr.match(/name\s*=\s*"([^"]*)"/);
    if (nameMatch && !opts.label)
        opts.label = nameMatch[1];
    const iterMatch = optStr.match(/iterations\s*=\s*(\d+)/);
    if (iterMatch)
        opts.iterations = parseInt(iterMatch[1]);
    const inputMatch = optStr.match(/input\s*=\s*'([^']*)'/);
    if (inputMatch)
        opts.input = inputMatch[1];
    return opts;
}
export function extractBenchTargets(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const targets = [];
    let match;
    BENCH_PATTERN.lastIndex = 0;
    while ((match = BENCH_PATTERN.exec(content)) !== null) {
        const optStr = match[1] || '';
        const funcName = match[3] || match[4];
        if (!funcName)
            continue;
        const lineNum = content.slice(0, match.index).split('\n').length;
        const opts = parseOptions(optStr);
        targets.push({
            name: opts.label || funcName,
            file: filePath,
            line: lineNum,
            options: opts,
        });
    }
    return targets;
}
export async function findBenchTargets(searchPath) {
    const stats = await import('fs').then(fs => fs.promises.stat(searchPath).catch(() => null));
    let files;
    if (stats?.isDirectory()) {
        files = await resolveBenchFiles(['**/*.{ts,js}'], searchPath);
    }
    else {
        files = stats?.isFile()
            ? [path.resolve(searchPath)]
            : await resolveBenchFiles([searchPath], process.cwd());
    }
    return collectBenchTargets(files);
}
export async function findBenchTargetsByGlob(patterns, cwd = process.cwd()) {
    const files = await resolveBenchFiles(Array.isArray(patterns) ? patterns : [patterns], cwd);
    return collectBenchTargets(files);
}
async function resolveBenchFiles(patterns, cwd) {
    const files = await glob(patterns, {
        cwd,
        absolute: true,
        ignore: ['**/node_modules/**', '**/*.d.ts']
    });
    return Array.from(new Set(files)).sort();
}
function collectBenchTargets(files) {
    const allTargets = [];
    for (const file of files) {
        try {
            allTargets.push(...extractBenchTargets(file));
        }
        catch {
            // skip files that can't be read
        }
    }
    return allTargets;
}
