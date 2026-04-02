import test from 'node:test'
import assert from 'node:assert/strict'
import { createDebouncedCallback } from '../src/watcher.ts'

test('createDebouncedCallback coalesces rapid changes into one run', async () => {
  const scheduled = new Map<number, () => void>()
  let nextId = 0
  let runCount = 0

  const trigger = createDebouncedCallback(
    () => {
      runCount += 1
    },
    200,
    {
      setTimer: (callback) => {
        const id = nextId++
        scheduled.set(id, callback)

        return {
          cancel: () => {
            scheduled.delete(id)
          },
        }
      },
    },
  )

  trigger()
  trigger()
  trigger()

  assert.equal(scheduled.size, 1)
  assert.equal(runCount, 0)

  const callback = scheduled.values().next().value as (() => void) | undefined
  assert.ok(callback)
  await callback()

  assert.equal(runCount, 1)
})
