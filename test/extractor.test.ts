import test from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractBenchTargets, findBenchTargets, findBenchTargetsByGlob } from '../src/extractor.ts'

const fixturePath = path.join(process.cwd(), 'test/fixtures/sample-bench.ts')

test('extractor finds // @bench above a function declaration from a real fixture file', () => {
  const content = readFileSync(fixturePath, 'utf8')
  assert.match(content, /\/\/ @bench\s+export function addNumbers/)

  const targets = extractBenchTargets(fixturePath)

  assert.ok(targets.some(target => target.name === 'addNumbers'))
})

test('extractor finds // @bench above an arrow function from a real fixture file', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.ok(targets.some(target => target.options.label === 'Array sort'))
})

test('extractor finds // @bench above an async function from a real fixture file', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.ok(targets.some(target => target.name === 'multiplyNumbers'))
})

test('extractor returns the function name correctly for unlabeled functions', () => {
  const targets = extractBenchTargets(fixturePath)
  const addNumbers = targets.find(target => target.name === 'addNumbers')

  assert.ok(addNumbers)
  assert.equal(addNumbers.options.label, undefined)
})

test('extractor ignores functions without an @bench annotation', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.equal(targets.some(target => target.name === 'helper'), false)
})

test('extractor handles multiple @bench functions in one file', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.equal(targets.length, 3)
})

test('extractor handles @bench with label="My Label"', () => {
  const targets = extractBenchTargets(fixturePath)
  const sortArray = targets.find(target => target.options.label === 'Array sort')

  assert.ok(sortArray)
  assert.equal(sortArray.name, 'Array sort')
})

test('extractor returns no targets for files without annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'plain.ts')

  try {
    writeFileSync(filePath, 'export function helper() { return 42 }\n')

    const targets = extractBenchTargets(filePath)

    assert.deepEqual(targets, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses label option from @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'label.ts')

  try {
    writeFileSync(filePath, '// @bench label="My Label"\nexport function labeled() { return 1 }\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'My Label')
    assert.equal(targets[0].options.label, 'My Label')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses iterations option from @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'iterations.ts')

  try {
    writeFileSync(filePath, '// @bench iterations=1000\nexport function manyRuns() { return 1 }\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'manyRuns')
    assert.equal(targets[0].options.iterations, 1000)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses input option from @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'input.ts')

  try {
    writeFileSync(filePath, "// @bench input='test data'\nexport function withInput(value: string) { return value }\n")

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'withInput')
    assert.equal(targets[0].options.input, 'test data')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses input option with double quotes from @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'input-double.ts')

  try {
    writeFileSync(filePath, '// @bench input="hello world"\nexport function withInput(value: string) { return value }\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].options.input, 'hello world')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses input option with single quotes from @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'input-single.ts')

  try {
    writeFileSync(filePath, "// @bench input='hello world'\nexport function withInput(value: string) { return value }\n")

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].options.input, 'hello world')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses input with double quotes alongside other options', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'input-mixed.ts')

  try {
    writeFileSync(filePath, '// @bench label="My Bench" input="test data" iterations=100\nexport function withInput(value: string) { return value }\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].options.label, 'My Bench')
    assert.equal(targets[0].options.input, 'test data')
    assert.equal(targets[0].options.iterations, 100)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses empty string input with double quotes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'input-empty.ts')

  try {
    writeFileSync(filePath, '// @bench input=""\nexport function withInput(value: string) { return value }\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].options.input, '')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor finds exported arrow functions annotated with @bench', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'exported-arrow.ts')

  try {
    writeFileSync(filePath, '// @bench\nexport const myFn = (x: number) => x * 2\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'myFn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor finds async functions annotated with @bench', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'async.ts')

  try {
    writeFileSync(filePath, '// @bench\nexport async function fetchData() { return 1 }\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'fetchData')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor handles three benchmark targets in one file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'multiple.ts')

  try {
    writeFileSync(
      filePath,
      [
        '// @bench',
        'export function one() { return 1 }',
        '',
        '// @bench label="Two"',
        'export const two = () => 2',
        '',
        '// @bench iterations=3',
        'async function three() { return 3 }',
        '',
      ].join('\n'),
    )

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 3)
    assert.deepEqual(targets.map(target => target.name), ['one', 'Two', 'three'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor finds non-exported const arrow functions annotated with @bench', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'const-arrow.ts')

  try {
    writeFileSync(filePath, '// @bench\nconst localFn = (value: number) => value + 1\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'localFn')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor ignores @bench annotations not followed by a function', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-extractor-'))
  const filePath = path.join(dir, 'dangling.ts')

  try {
    writeFileSync(filePath, '// @bench label="Missing"\nconst value = 1\n')

    const targets = extractBenchTargets(filePath)

    assert.deepEqual(targets, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findBenchTargets resolves a directory and returns annotated targets', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-find-'))

  try {
    writeFileSync(path.join(dir, 'alpha.ts'), '// @bench\nexport function alpha() { return 1 }\n')
    writeFileSync(path.join(dir, 'beta.js'), '// @bench\nconst beta = () => 2\n')
    writeFileSync(path.join(dir, 'types.d.ts'), '// @bench\nexport function ignored(): void\n')

    const targets = await findBenchTargets(dir)

    assert.deepEqual(targets.map(target => target.name), ['alpha', 'beta'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findBenchTargets resolves a single file path', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-find-'))
  const filePath = path.join(dir, 'single.ts')

  try {
    writeFileSync(filePath, '// @bench\nexport function single() { return 1 }\n')

    const targets = await findBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'single')
    assert.equal(targets[0].file, filePath)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findBenchTargets falls back to glob patterns for missing paths', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-find-'))

  try {
    writeFileSync(path.join(dir, 'globbed.ts'), '// @bench\nexport function globbed() { return 1 }\n')

    const previousCwd = process.cwd()
    process.chdir(dir)

    try {
      const targets = await findBenchTargets('*.ts')

      assert.equal(targets.length, 1)
      assert.equal(targets[0].name, 'globbed')
    } finally {
      process.chdir(previousCwd)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findBenchTargetsByGlob deduplicates matches across patterns', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-find-'))

  try {
    writeFileSync(path.join(dir, 'dup.ts'), '// @bench\nexport function deduped() { return 1 }\n')

    const targets = await findBenchTargetsByGlob(['*.ts', '**/*.ts'], dir)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'deduped')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('collectBenchTargets warns and skips unreadable files', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-warn-'))
  const goodFile = path.join(dir, 'good.ts')
  const badFile = path.join(dir, 'bad.ts')

  try {
    writeFileSync(goodFile, '// @bench\nexport function good() { return 1 }\n')
    writeFileSync(badFile, '// @bench\nexport function bad() { return 2 }\n')
    chmodSync(badFile, 0o000)

    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args.join(' '))

    try {
      const targets = await findBenchTargets(dir)

      assert.equal(targets.length, 1)
      assert.equal(targets[0].name, 'good')
      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /bench-this: skipping/)
      assert.match(warnings[0], /bad\.ts/)
    } finally {
      console.warn = originalWarn
      chmodSync(badFile, 0o644)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
