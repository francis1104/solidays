import { getAdminSession } from '../admin/auth'
import { getConversationById } from '../admin/repository'
import { errorResponse } from './http'
import { checkIpRateLimit, checkVisitorRateLimit } from './rate-limit'
import { findOpenConversation, findVisitor } from './repository'
import { ADMIN_REALTIME_LEASE_MS, connectConversation, isChatRealtimeEnabled } from './realtime'
import { isAllowedOrigin } from './security'
import { getVisitorId } from './session'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const adminRealtimePathPattern = /^\/api\/admin\/conversations\/([^/]+)\/realtime$/

function isWebSocketUpgrade(request: Request): boolean {
  return request.headers.get('upgrade')?.toLowerCase() === 'websocket'
}

export async function handleVisitorRealtimeRequest(
  request: Request,
  env: CloudflareEnv
): Promise<Response> {
  if (!isChatRealtimeEnabled(env)) {
    return errorResponse(404, 'CHAT_REALTIME_DISABLED', '实时留言暂未启用。')
  }
  if (!isWebSocketUpgrade(request)) {
    return errorResponse(426, 'WEBSOCKET_REQUIRED', '需要使用 WebSocket 连接。')
  }
  if (!isAllowedOrigin(request, String(env.CHAT_LOCAL_DEV) === 'true')) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '请求来源不受支持。')
  }

  const visitorId = getVisitorId(request)
  if (!visitorId) return errorResponse(401, 'CHAT_UNAUTHORIZED', '访客会话无效。')

  const expectedConversationId = new URL(request.url).searchParams.get('conversationId')
  if (!expectedConversationId || !uuidPattern.test(expectedConversationId)) {
    return errorResponse(400, 'INVALID_CONVERSATION_ID', '实时会话 ID 无效。')
  }

  try {
    const ipRateLimit = await checkIpRateLimit(env, request, 'realtime-connect')
    if (!ipRateLimit.success) {
      if (ipRateLimit.unavailable) {
        return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
      }
      return errorResponse(429, 'RATE_LIMITED', '连接太频繁了，请稍后再试。', {
        headers: { 'retry-after': '60' },
      })
    }

    const visitorRateLimit = await checkVisitorRateLimit(env, visitorId, 'realtime-connect')
    if (!visitorRateLimit.success) {
      if (visitorRateLimit.unavailable) {
        return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
      }
      return errorResponse(429, 'RATE_LIMITED', '连接太频繁了，请稍后再试。', {
        headers: { 'retry-after': '60' },
      })
    }

    const existingVisitor = await findVisitor(env.CHAT_DB, visitorId)
    if (!existingVisitor) return errorResponse(401, 'CHAT_UNAUTHORIZED', '访客会话无效。')

    const openConversation = await findOpenConversation(env.CHAT_DB, visitorId)
    if (!openConversation) {
      return errorResponse(404, 'CONVERSATION_NOT_FOUND', '当前没有开放的留言会话。')
    }
    if (openConversation.id !== expectedConversationId) {
      return errorResponse(409, 'CONVERSATION_CHANGED', '留言会话已发生变化，请重新同步。')
    }

    return await connectConversation(env, request, openConversation.id, 'visitor')
  } catch {
    console.error('Chat realtime visitor connection failed')
    return errorResponse(503, 'CHAT_REALTIME_UNAVAILABLE', '实时连接暂时不可用，请稍后再试。')
  }
}

export async function handleAdminRealtimeRequest(
  request: Request,
  env: CloudflareEnv,
  conversationId: string
): Promise<Response> {
  if (!isChatRealtimeEnabled(env)) {
    return errorResponse(404, 'CHAT_REALTIME_DISABLED', '实时留言暂未启用。')
  }
  const adminSession = await getAdminSession(env, request)
  if (!adminSession) {
    return errorResponse(401, 'ADMIN_UNAUTHORIZED', '未登录或会话已过期。')
  }
  if (!isWebSocketUpgrade(request)) {
    return errorResponse(426, 'WEBSOCKET_REQUIRED', '需要使用 WebSocket 连接。')
  }
  if (!isAllowedOrigin(request, String(env.CHAT_LOCAL_DEV) === 'true')) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '请求来源不受支持。')
  }
  if (!uuidPattern.test(conversationId)) {
    return errorResponse(400, 'INVALID_ID', '会话 ID 无效。')
  }

  try {
    const conversation = await getConversationById(env.CHAT_DB, conversationId)
    if (!conversation) return errorResponse(404, 'CONVERSATION_NOT_FOUND', '会话不存在。')
    if (conversation.status !== 'open') {
      return errorResponse(409, 'CONVERSATION_CLOSED', '会话已关闭。')
    }

    return await connectConversation(
      env,
      request,
      conversationId,
      'admin',
      Math.min(adminSession.expiresAt, Date.now() + ADMIN_REALTIME_LEASE_MS)
    )
  } catch {
    console.error('Admin realtime connection failed')
    return errorResponse(503, 'CHAT_REALTIME_UNAVAILABLE', '实时连接暂时不可用，请稍后再试。')
  }
}

export async function handleRealtimeRequest(
  request: Request,
  env: CloudflareEnv
): Promise<Response | null> {
  if (request.method !== 'GET') return null

  const url = new URL(request.url)
  if (url.pathname === '/api/chat/realtime') {
    return handleVisitorRealtimeRequest(request, env)
  }

  const match = adminRealtimePathPattern.exec(url.pathname)
  if (!match) return null

  let conversationId: string
  try {
    conversationId = decodeURIComponent(match[1])
  } catch {
    return errorResponse(400, 'INVALID_ID', '会话 ID 无效。')
  }

  return handleAdminRealtimeRequest(request, env, conversationId)
}
