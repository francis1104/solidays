import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { ChatRealtimeEvent } from './realtime-events.ts'
import {
  CHAT_REALTIME_AUDIENCE_HEADER,
  CHAT_REALTIME_AUTH_EXPIRES_AT_HEADER,
  CHAT_REALTIME_CONVERSATION_HEADER,
  type ChatSocketAudience,
} from './realtime-protocol.ts'
import { REALTIME_PUBLISH_RETRY_DELAYS_MS, retryRealtimePublish } from './realtime-retry.ts'

export const ADMIN_REALTIME_LEASE_MS = 10 * 60 * 1000
export { REALTIME_PUBLISH_RETRY_DELAYS_MS, retryRealtimePublish } from './realtime-retry.ts'

export function isChatRealtimeEnabled(env: CloudflareEnv): boolean {
  return String(env.CHAT_REALTIME_ENABLED) === 'true'
}

export function isConversationRealtimeEnabled(
  enabled: boolean,
  status: 'open' | 'closed'
): boolean {
  return enabled && status === 'open'
}

async function publishConversationEvent(
  env: CloudflareEnv,
  conversationId: string,
  event: ChatRealtimeEvent
): Promise<void> {
  if (!isChatRealtimeEnabled(env)) return

  try {
    await retryRealtimePublish(
      () => env.CHAT_CONVERSATIONS.getByName(conversationId).publish(event),
      REALTIME_PUBLISH_RETRY_DELAYS_MS
    )
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

export function scheduleConversationEvent(
  env: CloudflareEnv,
  conversationId: string,
  event: ChatRealtimeEvent
): void {
  if (!isChatRealtimeEnabled(env)) return

  const publishPromise = publishConversationEvent(env, conversationId, event)
  try {
    getCloudflareContext().ctx.waitUntil(publishPromise)
  } catch {
    // Route tests and non-Worker callers may not have an OpenNext context.
    // The publisher handles its own errors, so this remains best-effort.
    void publishPromise
  }
}

export function connectConversation(
  env: CloudflareEnv,
  request: Request,
  conversationId: string,
  audience: ChatSocketAudience,
  authExpiresAt?: number
): Promise<Response> {
  const headers = new Headers(request.headers)
  headers.set(CHAT_REALTIME_AUDIENCE_HEADER, audience)
  headers.set(CHAT_REALTIME_CONVERSATION_HEADER, conversationId)
  if (authExpiresAt !== undefined) {
    headers.set(CHAT_REALTIME_AUTH_EXPIRES_AT_HEADER, String(authExpiresAt))
  }

  return env.CHAT_CONVERSATIONS.getByName(conversationId).fetch(new Request(request, { headers }))
}
