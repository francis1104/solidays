import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_REALTIME_HANDSHAKE_FAILURES,
  mergeRealtimeMessages,
  shouldRefreshRealtimeBootstrap,
} from './realtime-client.ts'
import { isChatSocketAttachment } from './realtime-protocol.ts'

test('mergeRealtimeMessages deduplicates and follows D1 created_at/id order', () => {
  const result = mergeRealtimeMessages(
    [
      { id: 'b', createdAt: '2026-08-18T00:00:02.000Z' },
      { id: 'a', createdAt: '2026-08-18T00:00:01.000Z' },
    ],
    [
      { id: 'c', createdAt: '2026-08-18T00:00:03.000Z' },
      { id: 'b', createdAt: '2026-08-18T00:00:02.000Z' },
    ]
  )

  assert.deepEqual(
    result.map((message) => message.id),
    ['a', 'b', 'c']
  )
})

test('mergeRealtimeMessages uses the message id as a stable same-timestamp tie breaker', () => {
  const result = mergeRealtimeMessages(
    [
      { id: '0000000b', createdAt: '2026-08-18T00:00:01.000Z' },
      { id: '0000000a', createdAt: '2026-08-18T00:00:01.000Z' },
    ],
    []
  )

  assert.deepEqual(
    result.map((message) => message.id),
    ['0000000a', '0000000b']
  )
})

test('mergeRealtimeMessages keeps the greeting before persisted messages', () => {
  const result = mergeRealtimeMessages(
    [{ id: 'assistant-greeting' }],
    [{ id: 'message-1', createdAt: '2026-08-18T00:00:01.000Z' }],
    'assistant-greeting'
  )

  assert.deepEqual(
    result.map((message) => message.id),
    ['assistant-greeting', 'message-1']
  )
})

test('realtime handshake refresh starts only after the failure threshold', () => {
  assert.equal(shouldRefreshRealtimeBootstrap(MAX_REALTIME_HANDSHAKE_FAILURES - 1), false)
  assert.equal(shouldRefreshRealtimeBootstrap(MAX_REALTIME_HANDSHAKE_FAILURES), true)
})

test('socket attachments require an audience and conversation id', () => {
  assert.equal(
    isChatSocketAttachment({
      audience: 'admin',
      conversationId: 'conversation-1',
      authExpiresAt: Date.now() + 60_000,
    }),
    true
  )
  assert.equal(
    isChatSocketAttachment({ audience: 'admin', conversationId: 'conversation-1' }),
    true
  )
  assert.equal(isChatSocketAttachment({ audience: 'visitor' }), false)
  assert.equal(
    isChatSocketAttachment({
      audience: 'admin',
      conversationId: 'conversation-1',
      authExpiresAt: Number.NaN,
    }),
    false
  )
})
