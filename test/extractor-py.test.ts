import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractBenchTargets, findBenchTargets } from '../src/extractor.ts'

const fixturePath = path.join(process.cwd(), 'test/fixtures/sample-bench.py')

test('extractor finds # @bench above a Python function definition', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.ok(targets.some(t => t.name === 'add_numbers'))
})

test('extractor parses label option from Python @bench annotations', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.ok(targets.some(t => t.name === 'List sort' && t.options.label === 'List sort'))
})

test('extractor ignores Python functions without @bench annotation', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.equal(targets.some(t => t.name === 'helper'), false)
})

test('extractor sets lang="py" for Python targets', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.ok(targets.every(t => t.lang === 'py'))
})

test('extractor handles multiple @bench functions in a .py file', () => {
  const targets = extractBenchTargets(fixturePath)

  assert.equal(targets.length, 2)
})

test('extractor parses iterations option from Python @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-extractor-'))
  const filePath = path.join(dir, 'iters.py')

  try {
    writeFileSync(filePath, '# @bench iterations=500\ndef fast_fn():\n    return 1\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].name, 'fast_fn')
    assert.equal(targets[0].options.iterations, 500)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses input option with double quotes from Python @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-extractor-'))
  const filePath = path.join(dir, 'input-double.py')

  try {
    writeFileSync(filePath, '# @bench input="hello world"\ndef with_input(value):\n    return value\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].options.input, 'hello world')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses input option with single quotes from Python @bench annotations', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-extractor-'))
  const filePath = path.join(dir, 'input-single.py')

  try {
    writeFileSync(filePath, "# @bench input='hello world'\ndef with_input(value):\n    return value\n")

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].options.input, 'hello world')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('extractor parses input with double quotes alongside other options in Python', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-extractor-'))
  const filePath = path.join(dir, 'input-mixed.py')

  try {
    writeFileSync(filePath, '# @bench label="My Bench" input="test data" iterations=100\ndef with_input(value):\n    return value\n')

    const targets = extractBenchTargets(filePath)

    assert.equal(targets.length, 1)
    assert.equal(targets[0].options.label, 'My Bench')
    assert.equal(targets[0].options.input, 'test data')
    assert.equal(targets[0].options.iterations, 100)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findBenchTargets includes .py files alongside .ts files', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-find-'))

  try {
    writeFileSync(path.join(dir, 'a.ts'), '// @bench\nexport function tsFunc() { return 1 }\n')
    writeFileSync(path.join(dir, 'b.py'), '# @bench\ndef py_func():\n    return 1\n')

    const targets = await findBenchTargets(dir)

    assert.ok(targets.some(t => t.name === 'tsFunc' && t.lang === 'js'))
    assert.ok(targets.some(t => t.name === 'py_func' && t.lang === 'py'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findBenchTargets with lang=["py"] returns only Python targets', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bench-this-py-lang-'))

  try {
    writeFileSync(path.join(dir, 'a.ts'), '// @bench\nexport function tsFunc() { return 1 }\n')
    writeFileSync(path.join(dir, 'b.py'), '# @bench\ndef py_func():\n    return 1\n')

    const targets = await findBenchTargets(dir, ['py'])

    assert.equal(targets.every(t => t.lang === 'py'), true)
    assert.ok(targets.some(t => t.name === 'py_func'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
