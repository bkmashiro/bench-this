import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractBenchTargets } from '../src/extractor.ts'

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
