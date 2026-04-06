import test from 'node:test'
import assert from 'node:assert/strict'
import { BENCH_PATTERN, PY_BENCH_PATTERN } from '../src/patterns.ts'

function resetAndExec(pattern: RegExp, input: string): RegExpExecArray | null {
  pattern.lastIndex = 0
  return pattern.exec(input)
}

function resetAndExecAll(pattern: RegExp, input: string): RegExpExecArray[] {
  pattern.lastIndex = 0
  const matches: RegExpExecArray[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input)) !== null) {
    matches.push(match)
  }
  return matches
}

// BENCH_PATTERN tests

test('BENCH_PATTERN matches a plain function declaration', () => {
  const input = '// @bench\nfunction myFunc() {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![3], 'myFunc')
})

test('BENCH_PATTERN matches an exported function declaration', () => {
  const input = '// @bench\nexport function myFunc() {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![3], 'myFunc')
})

test('BENCH_PATTERN matches an async function declaration', () => {
  const input = '// @bench\nasync function fetchData() {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![3], 'fetchData')
})

test('BENCH_PATTERN matches an exported async function declaration', () => {
  const input = '// @bench\nexport async function doWork() {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![3], 'doWork')
})

test('BENCH_PATTERN matches a const arrow function', () => {
  const input = '// @bench\nconst arrowFn = () => {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![4], 'arrowFn')
})

test('BENCH_PATTERN matches an exported const arrow function', () => {
  const input = '// @bench\nexport const exportedFn = () => {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![4], 'exportedFn')
})

test('BENCH_PATTERN matches a const async arrow function', () => {
  const input = '// @bench\nconst asyncArrow = async () => {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![4], 'asyncArrow')
})

test('BENCH_PATTERN matches a let arrow function', () => {
  const input = '// @bench\nlet letFn = () => {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![4], 'letFn')
})

test('BENCH_PATTERN captures options string after @bench', () => {
  const input = '// @bench label="My Label" iterations=500\nfunction benchMe() {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.match(match![1], /label="My Label"/)
  assert.match(match![1], /iterations=500/)
})

test('BENCH_PATTERN does not match a function without @bench', () => {
  const input = 'function noAnnotation() {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.equal(match, null)
})

test('BENCH_PATTERN does not match @bench on a non-function line', () => {
  const input = '// @bench\nconst x = 42'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.equal(match, null)
})

test('BENCH_PATTERN finds multiple annotated functions', () => {
  const input = [
    '// @bench',
    'function firstFn() {}',
    '',
    '// @bench label="second"',
    'const secondFn = () => {}',
  ].join('\n')
  const matches = resetAndExecAll(BENCH_PATTERN, input)
  assert.equal(matches.length, 2)
  assert.equal(matches[0][3], 'firstFn')
  assert.equal(matches[1][4], 'secondFn')
})

test('BENCH_PATTERN allows extra whitespace between @bench line and function', () => {
  const input = '// @bench\n  function indented() {}'
  const match = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![3], 'indented')
})

// PY_BENCH_PATTERN tests

test('PY_BENCH_PATTERN matches a plain Python def', () => {
  const input = '# @bench\ndef my_func():'
  const match = resetAndExec(PY_BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![2], 'my_func')
})

test('PY_BENCH_PATTERN matches an async Python def', () => {
  const input = '# @bench\nasync def async_func():'
  const match = resetAndExec(PY_BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![2], 'async_func')
})

test('PY_BENCH_PATTERN captures options string after @bench', () => {
  const input = '# @bench label="Sorting" iterations=1000\ndef sort_list():'
  const match = resetAndExec(PY_BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.match(match![1], /label="Sorting"/)
})

test('PY_BENCH_PATTERN does not match a def without @bench', () => {
  const input = 'def no_annotation():'
  const match = resetAndExec(PY_BENCH_PATTERN, input)
  assert.equal(match, null)
})

test('PY_BENCH_PATTERN does not match a JS-style @bench annotation', () => {
  const input = '// @bench\ndef js_style():'
  const match = resetAndExec(PY_BENCH_PATTERN, input)
  assert.equal(match, null)
})

test('PY_BENCH_PATTERN finds multiple annotated Python functions', () => {
  const input = [
    '# @bench',
    'def first():',
    '',
    '# @bench label="second"',
    'def second():',
  ].join('\n')
  const matches = resetAndExecAll(PY_BENCH_PATTERN, input)
  assert.equal(matches.length, 2)
  assert.equal(matches[0][2], 'first')
  assert.equal(matches[1][2], 'second')
})

test('PY_BENCH_PATTERN allows extra whitespace between annotation and def', () => {
  const input = '# @bench\n  def indented():'
  const match = resetAndExec(PY_BENCH_PATTERN, input)
  assert.notEqual(match, null)
  assert.equal(match![2], 'indented')
})

test('BENCH_PATTERN is reusable across calls (lastIndex resets correctly)', () => {
  const input = '// @bench\nfunction fn1() {}'
  const first = resetAndExec(BENCH_PATTERN, input)
  const second = resetAndExec(BENCH_PATTERN, input)
  assert.notEqual(first, null)
  assert.notEqual(second, null)
  assert.equal(first![3], second![3])
})

test('PY_BENCH_PATTERN is reusable across calls (lastIndex resets correctly)', () => {
  const input = '# @bench\ndef fn1():'
  const first = resetAndExec(PY_BENCH_PATTERN, input)
  const second = resetAndExec(PY_BENCH_PATTERN, input)
  assert.notEqual(first, null)
  assert.notEqual(second, null)
  assert.equal(first![2], second![2])
})
