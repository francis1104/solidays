import { getCloudflareContext } from '@opennextjs/cloudflare'
import { errorResponse, jsonResponse } from '@/lib/chat/http'
import { buildIpRateLimitKey, checkRateLimit } from '@/lib/chat/rate-limit'
import { isAllowedOrigin } from '@/lib/chat/security'
import {
  buildAdminSessionClearCookie,
  buildAdminSessionCookie,
  createAdminSessionToken,
  verifyAdminPassword,
} from '@/lib/admin/auth'

export const dynamic = 'force-dynamic'

function getEnv(): CloudflareEnv | null {
  try {
    return getCloudflareContext().env as CloudflareEnv
  } catch {
    return null
  }
}

// Same generic copy for denials and throttling so responses leak nothing.
const LOGIN_DENIED_MESSAGE = '密钥无效或请求过于频繁，请稍后再试。'

export async function POST(request: Request) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'ADMIN_UNAVAILABLE', '管理服务暂时不可用，请稍后再试。')

  if (!isAllowedOrigin(request, String(env.CHAT_LOCAL_DEV) === 'true')) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '请求来源不受支持。')
  }

  const rateLimit = await checkRateLimit(
    env.ADMIN_LOGIN_LIMITER,
    buildIpRateLimitKey(request, 'admin-login')
  )
  if (!rateLimit.success) {
    if (rateLimit.unavailable) {
      return errorResponse(503, 'ADMIN_UNAVAILABLE', '管理服务暂时不可用，请稍后再试。')
    }
    return errorResponse(429, 'ADMIN_LOGIN_DENIED', LOGIN_DENIED_MESSAGE, {
      headers: { 'retry-after': '60' },
    })
  }

  let body: { key?: unknown }
  try {
    body = (await request.json()) as { key?: unknown }
  } catch {
    return errorResponse(400, 'INVALID_BODY', '请求体无效。')
  }

  if (typeof body.key !== 'string' || body.key.length === 0 || body.key.length > 200) {
    return errorResponse(400, 'INVALID_BODY', '请求体无效。')
  }

  const valid = await verifyAdminPassword(env, body.key)
  if (!valid) return errorResponse(401, 'ADMIN_LOGIN_DENIED', LOGIN_DENIED_MESSAGE)

  const token = await createAdminSessionToken(env)
  return jsonResponse({ ok: true }, 200, {
    headers: { 'set-cookie': buildAdminSessionCookie(token) },
  })
}

export async function DELETE(request: Request) {
  const env = getEnv()
  if (!env) return errorResponse(503, 'ADMIN_UNAVAILABLE', '管理服务暂时不可用，请稍后再试。')

  if (!isAllowedOrigin(request, String(env.CHAT_LOCAL_DEV) === 'true')) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '请求来源不受支持。')
  }

  return new Response(null, {
    status: 204,
    headers: { 'set-cookie': buildAdminSessionClearCookie(), 'cache-control': 'no-store' },
  })
}
