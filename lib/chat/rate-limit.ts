import { getClientIp } from './security'

export type RateLimitResult =
  | { success: true }
  | { success: false; unavailable: false }
  | { success: false; unavailable: true }

export function buildRateLimitKey(
  request: Request,
  visitorId: string | null,
  scope: string
): string {
  const subject = visitorId ? `visitor:${visitorId}` : `ip:${getClientIp(request)}`
  return `${scope}:${subject}`
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
