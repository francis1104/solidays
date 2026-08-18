import { getCloudflareContext } from '@opennextjs/cloudflare'
import { ChatQuotaExceededError, findVisitor, persistVisitorMessage } from '@/lib/chat/repository'
import { errorResponse, jsonResponse } from '@/lib/chat/http'
import { checkIpRateLimit, checkVisitorRateLimit } from '@/lib/chat/rate-limit'
import { isAllowedOrigin, normalizePageUrl } from '@/lib/chat/security'
import { publishConversationEvent } from '@/lib/chat/realtime'
import { buildMessageCreatedEvent } from '@/lib/chat/realtime-events'
import { buildVisitorCookie, createVisitorId, getVisitorId } from '@/lib/chat/session'
import { toConversationDto, toMessageDto } from '@/lib/chat/types'
import { verifyTurnstile } from '@/lib/chat/turnstile'
import { parseMessageInput } from '@/lib/chat/validation'

export const dynamic = 'force-dynamic'

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'CHAT_UNAVAILABLE', '留言服务暂时不可用，请稍后再试。')

  if (!isAllowedOrigin(request, String(env.CHAT_LOCAL_DEV) === 'true')) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '请求来源不受支持。')
  }

  const candidateVisitorId = getVisitorId(request)
  const ipRateLimit = await checkIpRateLimit(env, request, 'message')
  if (!ipRateLimit.success) {
    if (ipRateLimit.unavailable) {
      return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
    }
    return errorResponse(429, 'RATE_LIMITED', '留言太频繁了，请稍后再试。', {
      headers: { 'retry-after': '60' },
    })
  }

  let visitorId: string | null = null
  if (candidateVisitorId) {
    try {
      visitorId = await findVisitor(env.CHAT_DB, candidateVisitorId)
    } catch {
      return errorResponse(503, 'CHAT_UNAVAILABLE', '留言服务暂时不可用，请稍后再试。')
    }
  }

  if (visitorId) {
    const visitorRateLimit = await checkVisitorRateLimit(env, visitorId, 'message')
    if (!visitorRateLimit.success) {
      if (visitorRateLimit.unavailable) {
        return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
      }
      return errorResponse(429, 'RATE_LIMITED', '留言太频繁了，请稍后再试。', {
        headers: { 'retry-after': '60' },
      })
    }
  }

  const input = await parseMessageInput(request)
  if (!input) return errorResponse(400, 'INVALID_MESSAGE', '留言内容或验证参数无效。')

  const turnstile = await verifyTurnstile(env, input.turnstileToken, request)
  if (!turnstile.ok) {
    if (turnstile.reason === 'unavailable') {
      return errorResponse(503, 'TURNSTILE_UNAVAILABLE', '验证服务暂时不可用，请稍后再试。')
    }
    return errorResponse(403, 'TURNSTILE_FAILED', '验证未通过，请重试。')
  }

  const persistedVisitorId = visitorId ?? createVisitorId()
  try {
    const result = await persistVisitorMessage(env.CHAT_DB, persistedVisitorId, {
      ...input,
      pageUrl: normalizePageUrl(input.pageUrl, request),
    })
    await publishConversationEvent(
      env,
      result.conversation.id,
      buildMessageCreatedEvent(result.message)
    )
    const headers = new Headers()
    if (!visitorId) headers.set('set-cookie', buildVisitorCookie(persistedVisitorId, request))

    return jsonResponse(
      {
        conversation: toConversationDto(result.conversation),
        message: toMessageDto(result.message),
      },
      201,
      { headers }
    )
  } catch (error) {
    if (error instanceof ChatQuotaExceededError) {
      return errorResponse(
        429,
        'CHAT_QUOTA_EXCEEDED',
        '留言数量或存储上限已达到，请结束当前留言或稍后再试。'
      )
    }
    console.error('Chat message write failed')
    return errorResponse(500, 'CHAT_WRITE_FAILED', '留言保存失败，请稍后再试。')
  }
}
