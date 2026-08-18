import type { ChatRealtimeEvent } from './realtime-events'
import {
  CHAT_REALTIME_AUDIENCE_HEADER,
  CHAT_REALTIME_CONVERSATION_HEADER,
  type ChatSocketAudience,
} from './realtime-protocol'

export function isChatRealtimeEnabled(env: CloudflareEnv): boolean {
  return String(env.CHAT_REALTIME_ENABLED) === 'true'
}

export async function publishConversationEvent(
  env: CloudflareEnv,
  conversationId: string,
  event: ChatRealtimeEvent
): Promise<void> {
  if (!isChatRealtimeEnabled(env)) return

  try {
    await env.CHAT_CONVERSATIONS.getByName(conversationId).publish(event)
  } catch (error) {
    // D1 is authoritative. A DO outage must not turn a successful message
    // write into a failed HTTP command.
    console.error(
      JSON.stringify({
        event: 'chat.realtime.publish_failed',
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      })
    )
  }
}

export function connectConversation(
  env: CloudflareEnv,
  request: Request,
  conversationId: string,
  audience: ChatSocketAudience
): Promise<Response> {
  const headers = new Headers(request.headers)
  headers.set(CHAT_REALTIME_AUDIENCE_HEADER, audience)
  headers.set(CHAT_REALTIME_CONVERSATION_HEADER, conversationId)

  return env.CHAT_CONVERSATIONS.getByName(conversationId).fetch(new Request(request, { headers }))
}
