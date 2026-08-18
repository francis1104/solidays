export type ChatSocketAudience = 'visitor' | 'admin'

export type ChatSocketAttachment = {
  audience: ChatSocketAudience
  conversationId: string
  authExpiresAt?: number
}

export const CHAT_REALTIME_AUDIENCE_HEADER = 'x-chat-realtime-audience'
export const CHAT_REALTIME_CONVERSATION_HEADER = 'x-chat-realtime-conversation'
export const CHAT_REALTIME_AUTH_EXPIRES_AT_HEADER = 'x-chat-realtime-auth-expires-at'

export function isChatSocketAttachment(value: unknown): value is ChatSocketAttachment {
  if (!value || typeof value !== 'object') return false

  const attachment = value as Partial<ChatSocketAttachment>
  if (
    (attachment.audience !== 'visitor' && attachment.audience !== 'admin') ||
    typeof attachment.conversationId !== 'string' ||
    attachment.conversationId.length === 0
  ) {
    return false
  }

  return (
    attachment.authExpiresAt === undefined ||
    (typeof attachment.authExpiresAt === 'number' && Number.isFinite(attachment.authExpiresAt))
  )
}

export function isAdminRealtimeLeaseActive(
  attachment: ChatSocketAttachment,
  now = Date.now()
): boolean {
  return attachment.audience !== 'admin' || (attachment.authExpiresAt ?? 0) > now
}
