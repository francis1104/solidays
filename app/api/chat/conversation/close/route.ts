import { getCloudflareContext } from '@opennextjs/cloudflare'
import { closeOpenConversation, findVisitor } from '@/lib/chat/repository'
import { emptyResponse, errorResponse } from '@/lib/chat/http'
import { checkIpRateLimit, checkVisitorRateLimit } from '@/lib/chat/rate-limit'
import { isAllowedOrigin } from '@/lib/chat/security'
import { getVisitorId } from '@/lib/chat/session'

export const dynamic = 'force-dynamic'

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const candidateVisitorId = getVisitorId(request)
  if (!candidateVisitorId) return emptyResponse()

  const env = getEnv()
  if (!env) return errorResponse(503, 'CHAT_UNAVAILABLE', '留言服务暂时不可用，请稍后再试。')

  if (!isAllowedOrigin(request, String(env.CHAT_LOCAL_DEV) === 'true')) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '请求来源不受支持。')
  }

  const ipRateLimit = await checkIpRateLimit(env, request, 'close')
  if (!ipRateLimit.success) {
    if (ipRateLimit.unavailable) {
      return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
    }
    return errorResponse(429, 'RATE_LIMITED', '操作太频繁了，请稍后再试。', {
      headers: { 'retry-after': '60' },
    })
  }

  let visitorId: string | null = null
  try {
    visitorId = await findVisitor(env.CHAT_DB, candidateVisitorId)
  } catch {
    return errorResponse(503, 'CHAT_UNAVAILABLE', '留言服务暂时不可用，请稍后再试。')
  }
  if (!visitorId) return emptyResponse()

  const visitorRateLimit = await checkVisitorRateLimit(env, visitorId, 'close')
  if (!visitorRateLimit.success) {
    if (visitorRateLimit.unavailable) {
      return errorResponse(503, 'RATE_LIMIT_UNAVAILABLE', '访问保护服务暂时不可用，请稍后再试。')
    }
    return errorResponse(429, 'RATE_LIMITED', '操作太频繁了，请稍后再试。', {
      headers: { 'retry-after': '60' },
    })
  }

  try {
    await closeOpenConversation(env.CHAT_DB, visitorId)
    return emptyResponse()
  } catch {
    console.error('Chat conversation close failed')
    return errorResponse(500, 'CHAT_CLOSE_FAILED', '留言关闭失败，请稍后再试。')
  }
}
