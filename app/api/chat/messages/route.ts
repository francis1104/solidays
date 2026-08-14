import { getCloudflareContext } from '@opennextjs/cloudflare'
import { persistVisitorMessage } from '@/lib/chat/db'
import { errorResponse, jsonResponse } from '@/lib/chat/http'
import { buildRateLimitKey, checkRateLimit } from '@/lib/chat/rate-limit'
import { isAllowedOrigin, normalizePageUrl } from '@/lib/chat/security'
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

  const input = await parseMessageInput(request)
  if (!input) return errorResponse(400, 'INVALID_MESSAGE', '留言内容或验证参数无效。')

  const existingVisitorId = getVisitorId(request)
  const rateLimit = await checkRateLimit(
    env,
    buildRateLimitKey(request, existingVisitorId, 'message')
  )
  if (!rateLimit.success) {
    if (rateLimit.unavailable) {
      return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
    }
    return errorResponse(429, 'RATE_LIMITED', '留言太频繁了，请稍后再试。', {
      headers: { 'retry-after': '60' },
    })
  }

  const turnstile = await verifyTurnstile(env, input.turnstileToken, request)
  if (!turnstile.ok) {
    if (turnstile.reason === 'unavailable') {
      return errorResponse(503, 'TURNSTILE_UNAVAILABLE', '验证服务暂时不可用，请稍后再试。')
    }
    return errorResponse(403, 'TURNSTILE_FAILED', '验证未通过，请重试。')
  }

  const visitorId = existingVisitorId ?? createVisitorId()
  try {
    const result = await persistVisitorMessage(env.CHAT_DB, visitorId, {
      ...input,
      pageUrl: normalizePageUrl(input.pageUrl, request),
    })
    const headers = new Headers()
    if (!existingVisitorId) headers.set('set-cookie', buildVisitorCookie(visitorId, request))

    return jsonResponse(
      {
        conversation: toConversationDto(result.conversation),
        message: toMessageDto(result.message),
      },
      201,
      { headers }
    )
  } catch {
    console.error('Chat message write failed')
    return errorResponse(500, 'CHAT_WRITE_FAILED', '留言保存失败，请稍后再试。')
  }
}
