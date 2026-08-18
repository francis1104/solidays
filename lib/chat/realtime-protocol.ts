export type ChatSocketAudience = 'visitor' | 'admin'

export type ChatSocketAttachment = {
  audience: ChatSocketAudience
  conversationId: string
}

export const CHAT_REALTIME_AUDIENCE_HEADER = 'x-chat-realtime-audience'
export const CHAT_REALTIME_CONVERSATION_HEADER = 'x-chat-realtime-conversation'
