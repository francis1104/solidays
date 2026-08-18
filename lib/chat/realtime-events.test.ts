import assert from 'node:assert/strict'
import test from 'node:test'
import { buildConversationClosedEvent, buildMessageCreatedEvent, isChatRealtimeEvent } from './realtime-events.ts'
import type { MessageRow } from './types.ts'

const message: MessageRow = {
  id: '11111111-1111-4111-8111-111111111111',
  conversation_id: '22222222-2222-4222-8222-222222222222',
  role: 'visitor',
  content: 'hello',
  page_url: '/gallery',
  created_at: 1770000000000,
}

test('buildMessageCreatedEvent maps a D1 message to a realtime payload', () => {
  const event = buildMessageCreatedEvent(message)

  assert.equal(event.type, 'message.created')
  assert.equal(event.conversationId, message.conversation_id)
  assert.equal(event.occurredAt, message.created_at)
  assert.deepEqual(event.message, {
    id: message.id,
    role: message.role,
    content: message.content,
    pageUrl: message.page_url,
    createdAt: message.created_at,
  })
  assert.equal(isChatRealtimeEvent(event), true)
})

test('buildConversationClosedEvent creates a valid close event', () => {
  const event = buildConversationClosedEvent(message.conversation_id, message.created_at)

  assert.equal(event.type, 'conversation.closed')
  assert.equal(event.conversationId, message.conversation_id)
  assert.equal(event.occurredAt, message.created_at)
  assert.equal(isChatRealtimeEvent(event), true)
})

test('realtime event validator rejects malformed payloads', () => {
  assert.equal(isChatRealtimeEvent({ type: 'message.created' }), false)
  assert.equal(
    isChatRealtimeEvent({
      eventId: 'event',
      type: 'message.created',
      conversationId: message.conversation_id,
      occurredAt: message.created_at,
      message: { ...message, createdAt: Number.NaN },
    }),
    false
  )
})
