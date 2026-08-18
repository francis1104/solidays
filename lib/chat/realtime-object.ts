import { DurableObject } from 'cloudflare:workers'
import { isChatRealtimeEvent, type ChatRealtimeEvent } from './realtime-events'
import {
  CHAT_REALTIME_AUDIENCE_HEADER,
  CHAT_REALTIME_AUTH_EXPIRES_AT_HEADER,
  CHAT_REALTIME_CONVERSATION_HEADER,
  isChatSocketAttachment,
  type ChatSocketAttachment,
  type ChatSocketAudience,
} from './realtime-protocol'

function isAudience(value: string | null): value is ChatSocketAudience {
  return value === 'visitor' || value === 'admin'
}

function isOpenWebSocketRequest(request: Request): boolean {
  return request.method === 'GET' && request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}

function getAdminAuthExpiry(request: Request): number | null {
  const value = request.headers.get(CHAT_REALTIME_AUTH_EXPIRES_AT_HEADER)
  if (!value) return null

  const expiresAt = Number(value)
  return Number.isSafeInteger(expiresAt) ? expiresAt : null
}

function isValidAttachmentForAudience(attachment: unknown): attachment is ChatSocketAttachment {
  if (!isChatSocketAttachment(attachment)) return false
  return attachment.audience === 'visitor'
    ? attachment.authExpiresAt === undefined
    : attachment.authExpiresAt !== undefined
}

function isAdminSessionActive(attachment: ChatSocketAttachment): boolean {
  return attachment.audience !== 'admin' || (attachment.authExpiresAt ?? 0) > Date.now()
}

function closeSocket(socket: WebSocket, code: number, reason: string): void {
  try {
    socket.close(code, reason)
  } catch {
    // The runtime will clean up an already closed socket.
  }
}

export class ChatConversation extends DurableObject<CloudflareEnv> {
  async publish(event: ChatRealtimeEvent): Promise<void> {
    if (!isChatRealtimeEvent(event)) {
      throw new Error('INVALID_CHAT_REALTIME_EVENT')
    }

    const conversationId = this.ctx.id.name
    if (conversationId && event.conversationId !== conversationId) {
      throw new Error('CHAT_REALTIME_CONVERSATION_MISMATCH')
    }

    const payload = JSON.stringify(event)
    for (const socket of this.ctx.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue

      let attachment: ChatSocketAttachment | null = null
      try {
        attachment = socket.deserializeAttachment() as ChatSocketAttachment | null
      } catch {
        attachment = null
      }

      if (!isValidAttachmentForAudience(attachment)) {
        closeSocket(socket, 1008, 'Invalid realtime session')
        continue
      }
      if (!isAdminSessionActive(attachment)) {
        closeSocket(socket, 4001, 'Admin session expired')
        continue
      }

      try {
        socket.send(payload)
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: 'chat.realtime.socket_send_failed',
            conversationId: event.conversationId,
            error: error instanceof Error ? error.message : String(error),
          })
        )
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (!isOpenWebSocketRequest(request)) {
      return new Response('WebSocket upgrade required', {
        status: 426,
        headers: { 'cache-control': 'no-store' },
      })
    }

    const audience = request.headers.get(CHAT_REALTIME_AUDIENCE_HEADER)
    const conversationId = request.headers.get(CHAT_REALTIME_CONVERSATION_HEADER)
    if (!isAudience(audience) || !conversationId) {
      return new Response('Invalid realtime connection metadata', {
        status: 400,
        headers: { 'cache-control': 'no-store' },
      })
    }

    const objectName = this.ctx.id.name
    if (objectName && objectName !== conversationId) {
      return new Response('Realtime conversation mismatch', {
        status: 403,
        headers: { 'cache-control': 'no-store' },
      })
    }

    const authExpiresAt = audience === 'admin' ? getAdminAuthExpiry(request) : undefined
    if (audience === 'admin') {
      if (authExpiresAt === null || authExpiresAt === undefined || authExpiresAt <= Date.now()) {
        return new Response('Admin session expired', {
          status: 401,
          headers: { 'cache-control': 'no-store' },
        })
      }
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    const attachment: ChatSocketAttachment = {
      audience,
      conversationId,
      ...(typeof authExpiresAt === 'number' ? { authExpiresAt } : {}),
    }
    server.serializeAttachment(attachment)
    this.ctx.acceptWebSocket(server, [audience])

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Realtime is intentionally server-to-client in Phase 1/2. Client frames
    // are ignored, so malformed input can never become a message write.
    let attachment: ChatSocketAttachment | null = null
    try {
      attachment = ws.deserializeAttachment() as ChatSocketAttachment | null
    } catch {
      attachment = null
    }

    if (!isValidAttachmentForAudience(attachment)) {
      closeSocket(ws, 1008, 'Invalid realtime session')
      return
    }
    if (!isAdminSessionActive(attachment)) {
      closeSocket(ws, 4001, 'Admin session expired')
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.warn(
      JSON.stringify({
        event: 'chat.realtime.socket_error',
        error: error instanceof Error ? error.message : String(error),
      })
    )
    try {
      ws.close(1011, 'Realtime connection error')
    } catch {
      // The runtime will clean up an already closed socket.
    }
  }
}
