import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyConversationClosedBarrier,
  applyRealtimeError,
  decideRealtimeEvent,
  hasConversationIdentityChanged,
  isRealtimeGenerationCurrent,
  MAX_REALTIME_HANDSHAKE_FAILURES,
  mergeRealtimeMessages,
  shouldRefreshRealtimeBootstrap,
} from './realtime-client.ts'
import { isAdminRealtimeLeaseActive, isChatSocketAttachment } from './realtime-protocol.ts'
import { retryRealtimePublish } from './realtime-retry.ts'

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

test('conversation generation fencing rejects stale responses', () => {
  assert.equal(isRealtimeGenerationCurrent(4, 4), true)
  assert.equal(isRealtimeGenerationCurrent(4, 5), false)
  assert.equal(hasConversationIdentityChanged('conversation-a', 'conversation-b'), true)
  assert.equal(hasConversationIdentityChanged('conversation-a', 'conversation-a'), false)
})

test('visitor realtime event decisions fence buffered messages after recovery closes or switches conversation', () => {
  const messageFromA = {
    eventId: 'event-message-a',
    type: 'message.created' as const,
    conversationId: 'conversation-a',
    occurredAt: 10,
    message: {
      id: 'message-a',
      role: 'visitor' as const,
      content: 'stale message',
      pageUrl: '/a',
      createdAt: 10,
    },
  }
  const closeA = {
    eventId: 'event-close-a',
    type: 'conversation.closed' as const,
    conversationId: 'conversation-a',
    occurredAt: 11,
  }

  let currentConversationId: string | null = 'conversation-a'
  assert.equal(decideRealtimeEvent(messageFromA, currentConversationId).type, 'message.created')
  assert.equal(decideRealtimeEvent(closeA, currentConversationId).type, 'conversation.closed')

  // Recovery applies the authoritative close/switch before flushing the socket buffer.
  currentConversationId = null
  const bufferedAfterClose = [messageFromA].map((event) =>
    decideRealtimeEvent(event, currentConversationId)
  )
  assert.deepEqual(bufferedAfterClose, [{ type: 'ignore' }])

  currentConversationId = 'conversation-b'
  const bufferedAfterSwitch = [messageFromA].map((event) =>
    decideRealtimeEvent(event, currentConversationId)
  )
  assert.deepEqual(bufferedAfterSwitch, [{ type: 'ignore' }])
})

test('conversation.closed is an authoritative UI barrier for the matching conversation', () => {
  const closed = applyConversationClosedBarrier(
    { conversationId: 'conversation-a', status: 'open', realtimeEnabled: true },
    'conversation-a'
  )
  assert.deepEqual(closed, {
    conversationId: 'conversation-a',
    status: 'closed',
    realtimeEnabled: false,
  })

  assert.deepEqual(
    applyConversationClosedBarrier(
      { conversationId: 'conversation-b', status: 'open', realtimeEnabled: true },
      'conversation-a'
    ),
    { conversationId: 'conversation-b', status: 'open', realtimeEnabled: true }
  )
})

test('a stale Admin sendReply error cannot overwrite the newer conversation error state', () => {
  const generationA = 4
  const generationB = 5
  const currentError = applyRealtimeError('B error', generationA, generationB, 'A failed')

  assert.equal(currentError, 'B error')
  assert.equal(applyRealtimeError(currentError, generationB, generationB, 'B failed'), 'B failed')
})

test('an expired Admin lease closes the delivery path even when the first event is conversation.closed', () => {
  const attachment = {
    audience: 'admin' as const,
    conversationId: 'conversation-a',
    authExpiresAt: 1_000,
  }
  assert.equal(isAdminRealtimeLeaseActive(attachment, 999), true)
  assert.equal(isAdminRealtimeLeaseActive(attachment, 1_000), false)

  const closed = applyConversationClosedBarrier(
    { conversationId: 'conversation-a', status: 'open', realtimeEnabled: true },
    'conversation-a'
  )
  assert.equal(closed.status, 'closed')
  assert.equal(closed.realtimeEnabled, false)
})

test('a late message remains recoverable after a close barrier and stays deduplicated', () => {
  const closed = applyConversationClosedBarrier(
    { conversationId: 'conversation-a', status: 'open', realtimeEnabled: true },
    'conversation-a'
  )
  const reconciled = mergeRealtimeMessages(
    [{ id: 'm-before-close', createdAt: '2026-08-18T00:00:01.000Z' }],
    [
      { id: 'm-before-close', createdAt: '2026-08-18T00:00:01.000Z' },
      { id: 'm-late', createdAt: '2026-08-18T00:00:02.000Z' },
    ]
  )
  assert.equal(closed.status, 'closed')
  assert.deepEqual(
    reconciled.map((message) => message.id),
    ['m-before-close', 'm-late']
  )
})

test('realtime publish retries a transient failure without changing command semantics', async () => {
  let attempts = 0
  await retryRealtimePublish(async () => {
    attempts += 1
    if (attempts < 3) throw new Error('temporary')
  }, [0, 0, 0])
  assert.equal(attempts, 3)
})

test('realtime publish surfaces the final error after bounded retries', async () => {
  let attempts = 0
  await assert.rejects(
    retryRealtimePublish(async () => {
      attempts += 1
      throw new Error(`failure-${attempts}`)
    }, [0, 0]),
    { message: 'failure-2' }
  )
  assert.equal(attempts, 2)
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
