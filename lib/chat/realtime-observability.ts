import { isChatSocketAttachment, type ChatSocketAudience } from './realtime-protocol.ts'

type AttachmentSocket = {
  deserializeAttachment: () => unknown
}

export type SocketObservabilityContext = {
  conversationId: string | null
  audience: ChatSocketAudience | null
}

export function readSocketObservabilityContext(
  socket: AttachmentSocket
): SocketObservabilityContext {
  try {
    const attachment = socket.deserializeAttachment()
    if (!isChatSocketAttachment(attachment)) {
      return { conversationId: null, audience: null }
    }

    return {
      conversationId: attachment.conversationId,
      audience: attachment.audience,
    }
  } catch {
    return { conversationId: null, audience: null }
  }
}

export function buildSocketClosedLog(
  socket: AttachmentSocket,
  code: number,
  reason: string,
  wasClean: boolean
): {
  event: 'chat.realtime.socket_closed'
  conversationId: string | null
  audience: ChatSocketAudience | null
  code: number
  reason: string
  wasClean: boolean
} {
  const context = readSocketObservabilityContext(socket)
  return {
    event: 'chat.realtime.socket_closed',
    conversationId: context.conversationId,
    audience: context.audience,
    code,
    reason,
    wasClean,
  }
}

export function buildSocketErrorLog(
  socket: AttachmentSocket,
  error: unknown
): {
  event: 'chat.realtime.socket_error'
  conversationId: string | null
  audience: ChatSocketAudience | null
  error: string
} {
  const context = readSocketObservabilityContext(socket)
  return {
    event: 'chat.realtime.socket_error',
    conversationId: context.conversationId,
    audience: context.audience,
    error: error instanceof Error ? error.message : String(error),
  }
}
