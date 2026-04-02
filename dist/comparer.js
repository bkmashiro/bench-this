import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findBenchTargets } from './extractor.js';
import { runAll } from './runner.js';
const execFileAsync = promisify(execFile);
export function diffBenchmarkResults(currentResults, branchResults) {
    const currentMap = new Map(currentResults.map(result => [result.name, result]));
    const branchMap = new Map(branchResults.map(result => [result.name, result]));
    const names = Array.from(new Set([...currentMap.keys(), ...branchMap.keys()])).sort();
    return names.map(name => {
        const current = currentMap.get(name);
        const branch = branchMap.get(name);
        if (!current) {
            return { name, branch, status: 'missing-current' };
        }
        if (!branch) {
            return { name, current, status: 'missing-branch' };
        }
        const pctChange = branch.opsPerSec === 0
            ? undefined
            : ((current.opsPerSec - branch.opsPerSec) / branch.opsPerSec) * 100;
        let status = 'unchanged';
        if (pctChange !== undefined) {
            if (pctChange > 0)
                status = 'improved';
            if (pctChange < 0)
                status = 'regression';
        }
        return { name, current, branch, pctChange, status };
    });
}
export function printBranchComparison(comparisons, currentBranch, targetBranch, log = console.log) {
    log();
    log('Results:');
    for (const comparison of comparisons) {
        if (!comparison.current) {
            log(`  ${comparison.name.padEnd(16)} current: n/a   ${targetBranch}: ${formatOps(comparison.branch?.opsPerSec ?? 0)} ops/sec   missing on current branch`);
            continue;
        }
        if (!comparison.branch) {
            log(`  ${comparison.name.padEnd(16)} current: ${formatOps(comparison.current.opsPerSec)} ops/sec   ${targetBranch}: n/a   new on ${currentBranch}`);
            continue;
        }
        const pctChange = comparison.pctChange ?? 0;
        const sign = pctChange >= 0 ? '+' : '';
        const indicator = comparison.status === 'improved'
            ? '✅ improved'
            : comparison.status === 'regression'
                ? '⚠ regression'
                : 'unchanged';
        log(`  ${comparison.name.padEnd(16)} current: ${formatOps(comparison.current.opsPerSec)} ops/sec   ${targetBranch}: ${formatOps(comparison.branch.opsPerSec)} ops/sec   ${sign}${pctChange.toFixed(1)}% ${indicator}`);
    }
    log();
}
export async function compareAgainstBranch(searchPath, targetBranch, deps = {}) {
    const findTargets = deps.findTargets ?? findBenchTargets;
    const runBenchmarks = deps.runBenchmarks ?? runAll;
    const runGit = deps.runGit ?? createGitRunner();
    const log = deps.log ?? console.log;
    const currentBranch = await runGit(['branch', '--show-current']);
    const hasLocalChanges = (await runGit(['status', '--porcelain'])).trim().length > 0;
    log(`Running benchmarks on current branch (${currentBranch})...`);
    const currentResults = await runBenchmarksForPath(searchPath, findTargets, runBenchmarks);
    let stashed = false;
    try {
        if (hasLocalChanges) {
            await runGit(['stash', 'push', '--include-untracked', '--message', 'bench-this compare']);
            stashed = true;
        }
        await runGit(['checkout', targetBranch]);
        log(`Running benchmarks on ${targetBranch}...`);
        const branchResults = await runBenchmarksForPath(searchPath, findTargets, runBenchmarks);
        const comparisons = diffBenchmarkResults(currentResults, branchResults);
        printBranchComparison(comparisons, currentBranch, targetBranch, log);
        return comparisons;
    }
    finally {
        await runGit(['checkout', currentBranch]);
        if (stashed) {
            await runGit(['stash', 'pop']);
        }
    }
}
async function runBenchmarksForPath(searchPath, findTargets, runBenchmarks) {
    const targets = await findTargets(searchPath);
    if (targets.length === 0) {
        return [];
    }
    return runBenchmarks(targets);
}
function formatOps(value) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function createGitRunner() {
    return async (args) => {
        const { stdout } = await execFileAsync('git', args, { encoding: 'utf8' });
        return stdout.trim();
    };
}
