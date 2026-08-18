import assert from 'node:assert/strict'
import test from 'node:test'
import { clearSingleFlight, getOrCreateSingleFlight } from './single-flight.ts'

test('concurrent token requests share one promise and one challenge', async () => {
  const pending = { current: null as Promise<string | null> | null }
  let challengeCalls = 0
  let resolveToken: ((token: string | null) => void) | null = null
  const createChallenge = () => {
    challengeCalls += 1
    return new Promise<string | null>((resolve) => {
      resolveToken = resolve
    })
  }

  const first = getOrCreateSingleFlight(pending, createChallenge)
  const second = getOrCreateSingleFlight(pending, createChallenge)

  assert.strictEqual(first, second)
  assert.equal(challengeCalls, 1)

  resolveToken?.('token')
  assert.equal(await first, 'token')
  clearSingleFlight(pending, first)
  assert.equal(pending.current, null)
})
