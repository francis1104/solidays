import { getClientIp } from './security'

export type RateLimitResult =
  | { success: true }
  | { success: false; unavailable: false }
  | { success: false; unavailable: true }

export function buildIpRateLimitKey(request: Request, scope: string): string {
  return `${scope}:ip:${getClientIp(request)}`
}

export function buildVisitorRateLimitKey(visitorId: string, scope: string): string {
  return `${scope}:visitor:${visitorId}`
}

/**
 * The visitor cookie is client-controlled, so it must never be the only
 * identity used for chat abuse controls. Always apply a trusted-IP quota
 * first, then add the visitor bucket for session-level isolation.
 */
export function checkIpRateLimit(
  env: CloudflareEnv,
  request: Request,
  scope: string
): Promise<RateLimitResult> {
  return checkRateLimit(env, buildIpRateLimitKey(request, scope))
}

export function checkVisitorRateLimit(
  env: CloudflareEnv,
  visitorId: string,
  scope: string
): Promise<RateLimitResult> {
  return checkRateLimit(env, buildVisitorRateLimitKey(visitorId, scope))
}

export async function checkRateLimit(env: CloudflareEnv, key: string): Promise<RateLimitResult> {
  const limiter = env.CHAT_RATE_LIMITER
  if (!limiter) return { success: false, unavailable: true }

  try {
    const result = await limiter.limit({ key })
    return result.success ? { success: true } : { success: false, unavailable: false }
  } catch {
    return { success: false, unavailable: true }
  }
}
