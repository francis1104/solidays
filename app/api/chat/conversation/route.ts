import { getCloudflareContext } from '@opennextjs/cloudflare'
import { errorResponse, jsonResponse } from '@/lib/chat/http'
import { decodeMessageCursor, findVisitor, loadOpenConversation } from '@/lib/chat/db'
import { CHAT_LIMITS } from '@/lib/chat/limits'
import { checkIpRateLimit, checkVisitorRateLimit } from '@/lib/chat/rate-limit'
import { getVisitorId } from '@/lib/chat/session'
import { toConversationDto, toMessageDto } from '@/lib/chat/types'

export const dynamic = 'force-dynamic'

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'CHAT_UNAVAILABLE', '留言服务暂时不可用，请稍后再试。')

  const ipRateLimit = await checkIpRateLimit(env, request, 'conversation-read')
  if (!ipRateLimit.success) {
    if (ipRateLimit.unavailable) {
      return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
    }
    return errorResponse(429, 'RATE_LIMITED', '读取太频繁了，请稍后再试。', {
      headers: { 'retry-after': '60' },
    })
  }

  const visitorCandidate = getVisitorId(request)
  if (!visitorCandidate) {
    return jsonResponse({ conversation: null, messages: [], hasMore: false, nextCursor: null })
  }

  const url = new URL(request.url)
  const cursorValue = url.searchParams.get('cursor')
  const cursor = cursorValue ? decodeMessageCursor(cursorValue) : null
  if (cursorValue && !cursor) {
    return errorResponse(400, 'INVALID_CURSOR', '留言历史游标无效。')
  }

  const requestedLimit = url.searchParams.get('limit')
  const limit = requestedLimit === null ? CHAT_LIMITS.historyPageSize : Number(requestedLimit)
  if (!Number.isInteger(limit) || limit < 1) {
    return errorResponse(400, 'INVALID_LIMIT', '留言历史分页参数无效。')
  }

  let visitorId: string | null = null
  try {
    visitorId = await findVisitor(env.CHAT_DB, visitorCandidate)
  } catch {
    console.error('Chat conversation read failed')
    return errorResponse(500, 'CHAT_READ_FAILED', '留言读取失败，请稍后再试。')
  }

  if (!visitorId) {
    return jsonResponse({ conversation: null, messages: [], hasMore: false, nextCursor: null })
  }

  const visitorRateLimit = await checkVisitorRateLimit(env, visitorId, 'conversation-read')
  if (!visitorRateLimit.success) {
    if (visitorRateLimit.unavailable) {
      return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
    }
    return errorResponse(429, 'RATE_LIMITED', '读取太频繁了，请稍后再试。', {
      headers: { 'retry-after': '60' },
    })
  }

  try {
    const result = await loadOpenConversation(
      env.CHAT_DB,
      visitorId,
      cursor,
      Math.min(limit, CHAT_LIMITS.historyPageSize)
    )
    if (!result)
      return jsonResponse({ conversation: null, messages: [], hasMore: false, nextCursor: null })

    return jsonResponse({
      conversation: toConversationDto(result.conversation),
      messages: result.messages.messages.map(toMessageDto),
      hasMore: result.messages.hasMore,
      nextCursor: result.messages.nextCursor,
    })
  } catch {
    console.error('Chat conversation read failed')
    return errorResponse(500, 'CHAT_READ_FAILED', '留言读取失败，请稍后再试。')
  }
}
