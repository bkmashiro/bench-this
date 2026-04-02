# bench-this

A TypeScript CLI tool that scans source files for `// @bench` comments and runs performance benchmarks with regression detection.

## Installation

```bash
pnpm add -g bench-this
# or use locally with:
npx bench-this
```

## Usage

### Annotate your functions

Add a `// @bench` comment directly before any function you want to benchmark:

```ts
// @bench
export function parseCSV(input: string): string[][] {
  return input.split('\n').map(line => line.split(','))
}

// @bench name="Sort large array" iterations=200
export function sortNumbers(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b)
}

// @bench input='hello@world.com'
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// @bench iterations=500
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}
```

### @bench annotation options

| Option | Description | Example |
|--------|-------------|---------|
| `name` | Display name for the benchmark | `name="My benchmark"` |
| `iterations` | Number of iterations to run | `iterations=500` |
| `input` | Input value to pass to the function | `input='hello@example.com'` |

### CLI Commands

#### `bench-this list [path]`

List all `@bench` annotated functions found in the given path (file or directory).

```bash
bench-this list src/
bench-this list src/utils.ts
```

#### `bench-this run [path]`

Run all benchmarks and compare results to the saved baseline.

```bash
bench-this run src/
bench-this run src/utils.ts --threshold 15
bench-this run src/ --json
bench-this run src/ --ci
```

Options:
- `--threshold <n>` — Regression threshold as a percentage (default: `10`)
- `--json` — Output results as JSON
- `--ci` — Exit with code 1 if any regressions are found

#### `bench-this save [path]`

Run benchmarks and save the results as the new baseline.

```bash
bench-this save src/
```

#### `bench-this compare`

Show the saved baseline data.

```bash
bench-this compare
bench-this compare --json
```

## CI Integration

Add `bench-this` to your CI pipeline to detect performance regressions automatically.

### GitHub Actions example

```yaml
name: Benchmarks

on:
  pull_request:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Restore baseline
        uses: actions/cache@v4
        with:
          path: .bench-baseline.json
          key: bench-baseline-${{ github.base_ref }}
          restore-keys: bench-baseline-

      - name: Run benchmarks (fail on regression)
        run: npx bench-this run src/ --ci --threshold 10

      - name: Save new baseline (on main only)
        if: github.ref == 'refs/heads/main'
        run: npx bench-this save src/
```

### Workflow

1. On your main branch, run `bench-this save` to establish a baseline.
2. On feature branches, run `bench-this run --ci` — it will exit 1 if any benchmark regresses more than the threshold.
3. After merging, update the baseline on main with `bench-this save`.

## Development

```bash
git clone https://github.com/yourname/bench-this
cd bench-this
pnpm install
pnpm dev list test/fixtures/
pnpm dev run test/fixtures/
```

## License

ISC
