import type { MessageRow } from './types'

export type ChatRealtimeMessage = {
  id: string
  role: 'visitor' | 'owner' | 'system'
  content: string
  pageUrl: string | null
  createdAt: number
}

export type ChatRealtimeEvent =
  | {
      eventId: string
      type: 'message.created'
      conversationId: string
      occurredAt: number
      message: ChatRealtimeMessage
    }
  | {
      eventId: string
      type: 'conversation.closed'
      conversationId: string
      occurredAt: number
    }

export function buildMessageCreatedEvent(message: MessageRow): ChatRealtimeEvent {
  return {
    eventId: crypto.randomUUID(),
    type: 'message.created',
    conversationId: message.conversation_id,
    occurredAt: message.created_at,
    message: {
      id: message.id,
      role: message.role,
      content: message.content,
      pageUrl: message.page_url,
      createdAt: message.created_at,
    },
  }
}

export function buildConversationClosedEvent(
  conversationId: string,
  occurredAt = Date.now()
): ChatRealtimeEvent {
  return {
    eventId: crypto.randomUUID(),
    type: 'conversation.closed',
    conversationId,
    occurredAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidMessage(value: unknown): value is ChatRealtimeMessage {
  if (!isRecord(value)) return false

  return (
    typeof value.id === 'string' &&
    (value.role === 'visitor' || value.role === 'owner' || value.role === 'system') &&
    typeof value.content === 'string' &&
    (typeof value.pageUrl === 'string' || value.pageUrl === null) &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt)
  )
}

export function isChatRealtimeEvent(value: unknown): value is ChatRealtimeEvent {
  if (!isRecord(value)) return false
  if (typeof value.eventId !== 'string' || value.eventId.length === 0) return false
  if (typeof value.conversationId !== 'string' || value.conversationId.length === 0) return false
  if (typeof value.occurredAt !== 'number' || !Number.isFinite(value.occurredAt)) return false

  if (value.type === 'conversation.closed') return true
  return value.type === 'message.created' && isValidMessage(value.message)
}
