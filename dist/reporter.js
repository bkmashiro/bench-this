import chalk from 'chalk';
export function compare(results, baseline, threshold) {
    return results.map(result => {
        const base = baseline[result.name];
        if (!base) {
            return { result, isRegression: false };
        }
        const pctChange = ((result.opsPerSec - base.opsPerSec) / base.opsPerSec) * 100;
        return {
            result,
            baseline: base,
            pctChange,
            isRegression: pctChange < -threshold,
        };
    });
}
function fmtOps(n) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function fmtMs(n) {
    return n.toFixed(3) + 'ms';
}
function getStatus(pctChange, threshold) {
    if (pctChange < -threshold)
        return 'regression';
    if (pctChange > threshold)
        return 'improvement';
    return 'stable';
}
export function printReport(comparisons, json = false) {
    if (json) {
        console.log(JSON.stringify(comparisons, null, 2));
        return;
    }
    console.log();
    console.log(chalk.bold('bench-this results'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();
    const regressions = comparisons.filter(c => c.isRegression);
    for (const c of comparisons) {
        const { result, baseline, pctChange, isRegression } = c;
        console.log(chalk.bold(`  ${result.name.padEnd(20)}`), chalk.cyan(`${fmtOps(result.opsPerSec)} ops/s`), chalk.dim(`  ${fmtMs(result.avgMs)} avg`));
        if (baseline !== undefined && pctChange !== undefined) {
            const sign = pctChange >= 0 ? '+' : '';
            const pctStr = `${sign}${pctChange.toFixed(1)}%`;
            const status = getStatus(pctChange, 20);
            if (status === 'regression') {
                console.log(chalk.dim(`    vs baseline:`), chalk.dim(`${fmtOps(baseline.opsPerSec)} ops/s`), chalk.red(`  ⚠️  ${pctStr} regression`));
            }
            else if (status === 'improvement') {
                console.log(chalk.dim(`    vs baseline:`), chalk.dim(`${fmtOps(baseline.opsPerSec)} ops/s`), chalk.green(`  ✅  ${pctStr} improvement`));
            }
            else {
                console.log(chalk.dim(`    vs baseline:`), chalk.dim(`${fmtOps(baseline.opsPerSec)} ops/s`), chalk.green(`  ✅  ${pctStr} stable`));
            }
        }
        else {
            console.log(chalk.dim(`    first run  💡 Run \`bench-this save\` to set baseline`));
        }
        console.log();
    }
    console.log(chalk.dim('─'.repeat(50)));
    if (regressions.length > 0) {
        console.log(chalk.red(`\n${regressions.length} regression${regressions.length > 1 ? 's' : ''} found. Run \`bench-this save\` to update baseline.`));
    }
    else if (comparisons.some(c => c.baseline)) {
        console.log(chalk.green('\nAll benchmarks within threshold.'));
    }
    console.log();
}
export function printList(targets) {
    console.log();
    console.log(chalk.bold('bench-this — annotated functions'));
    console.log(chalk.dim('─'.repeat(50)));
    console.log();
    for (const t of targets) {
        console.log(chalk.cyan(`  ${t.name.padEnd(25)}`), chalk.dim(`${t.file}:${t.line}`));
        if (t.options.iterations) {
            console.log(chalk.dim(`    iterations: ${t.options.iterations}`));
        }
        if (t.options.input) {
            console.log(chalk.dim(`    input: ${t.options.input}`));
        }
    }
    console.log();
    console.log(chalk.dim(`${targets.length} function${targets.length !== 1 ? 's' : ''} found`));
    console.log();
}
