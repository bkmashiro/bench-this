import { readFileSync, writeFileSync, existsSync } from 'fs';
import * as path from 'path';
const BASELINE_FILE = '.bench-baseline.json';
export function loadBaseline(cwd = process.cwd()) {
    const filePath = path.join(cwd, BASELINE_FILE);
    if (!existsSync(filePath))
        return null;
    try {
        return JSON.parse(readFileSync(filePath, 'utf-8'));
    }
    catch {
        return null;
    }
}
export function saveBaseline(results, cwd = process.cwd()) {
    const filePath = path.join(cwd, BASELINE_FILE);
    const existing = loadBaseline(cwd) ?? {};
    for (const r of results) {
        existing[r.name] = {
            opsPerSec: r.opsPerSec,
            avgMs: r.avgMs,
            savedAt: new Date().toISOString().split('T')[0],
        };
    }
    writeFileSync(filePath, JSON.stringify(existing, null, 2));
}
