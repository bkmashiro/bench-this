import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLangs, parseThreshold } from '../src/index.ts'

// parseLangs

test('parseLangs returns both languages when no option is given', () => {
  assert.deepEqual(parseLangs(undefined), ['js', 'py'])
})

test('parseLangs returns both languages for empty string', () => {
  assert.deepEqual(parseLangs(''), ['js', 'py'])
})

test('parseLangs parses a single valid language', () => {
  assert.deepEqual(parseLangs('js'), ['js'])
  assert.deepEqual(parseLangs('py'), ['py'])
})

test('parseLangs parses comma-separated valid languages', () => {
  assert.deepEqual(parseLangs('js,py'), ['js', 'py'])
  assert.deepEqual(parseLangs('py,js'), ['py', 'js'])
})

test('parseLangs trims whitespace around entries', () => {
  assert.deepEqual(parseLangs(' js , py '), ['js', 'py'])
})

test('parseLangs filters out invalid entries', () => {
  assert.deepEqual(parseLangs('js,ts,py'), ['js', 'py'])
})

test('parseLangs returns empty array and warns when all entries are invalid', () => {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }

  try {
    const result = parseLangs('javascript')
    assert.deepEqual(result, [])
    assert.equal(warnings.length, 1)
    assert.ok(warnings[0].includes('javascript'), `expected warning to mention input, got: ${warnings[0]}`)
    assert.ok(warnings[0].includes('js'), `expected warning to list valid values, got: ${warnings[0]}`)
    assert.ok(warnings[0].includes('py'), `expected warning to list valid values, got: ${warnings[0]}`)
  } finally {
    console.warn = original
  }
})

test('parseLangs does not warn when input is valid', () => {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }

  try {
    parseLangs('js')
    assert.equal(warnings.length, 0)
  } finally {
    console.warn = original
  }
})

// parseThreshold

test('parseThreshold returns the numeric value for a valid string', () => {
  assert.equal(parseThreshold('10'), 10)
  assert.equal(parseThreshold('0'), 0)
  assert.equal(parseThreshold('5.5'), 5.5)
  assert.equal(parseThreshold('100'), 100)
})

test('parseThreshold returns null for non-numeric input', () => {
  assert.equal(parseThreshold('abc'), null)
  assert.equal(parseThreshold(''), null)
  assert.equal(parseThreshold('NaN'), null)
})

test('parseThreshold returns null for negative values', () => {
  assert.equal(parseThreshold('-1'), null)
  assert.equal(parseThreshold('-0.1'), null)
})

test('parseThreshold returns null for Infinity', () => {
  assert.equal(parseThreshold('Infinity'), null)
  assert.equal(parseThreshold('-Infinity'), null)
})

test('parseThreshold accepts zero as a valid threshold', () => {
  assert.equal(parseThreshold('0'), 0)
})
