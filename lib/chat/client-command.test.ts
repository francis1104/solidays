import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acknowledgeClientMessage,
  acquireSendLock,
  getOrCreateClientMessageId,
  releaseSendLock,
} from './client-command.ts'

test('synchronous send lock allows only one in-flight command', () => {
  const lock = { current: false }

  assert.equal(acquireSendLock(lock), true)
  assert.equal(acquireSendLock(lock), false)

  releaseSendLock(lock)
  assert.equal(acquireSendLock(lock), true)
})

test('the same logical message reuses its client id after a retry', () => {
  const pending = { current: { id: null, content: null } }
  let nextId = 0
  const createId = () => `client-message-${++nextId}`

  const first = getOrCreateClientMessageId(pending, 'hello', createId)
  const retry = getOrCreateClientMessageId(pending, 'hello', createId)
  const edited = getOrCreateClientMessageId(pending, 'hello again', createId)

  assert.equal(first, 'client-message-1')
  assert.equal(retry, first)
  assert.equal(edited, 'client-message-2')
  assert.deepEqual(pending.current, { id: edited, content: 'hello again' })

  acknowledgeClientMessage(pending)
  assert.deepEqual(pending.current, { id: null, content: null })
})
