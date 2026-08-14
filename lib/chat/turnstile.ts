import { getClientIp } from './security'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const EXPECTED_ACTION = 'chat_message'

type SiteverifyResponse = {
  success?: boolean
  action?: string
  hostname?: string
}

export type TurnstileResult = { ok: true } | { ok: false; reason: 'invalid' | 'unavailable' }

function allowedHostnames(request: Request): Set<string> {
  const hostname = new URL(request.url).hostname
  const hostnames = new Set([hostname])

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    hostnames.add('localhost')
    hostnames.add('127.0.0.1')
  }

  return hostnames
}

export async function verifyTurnstile(
  env: CloudflareEnv,
  token: string,
  request: Request
): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET_KEY
  if (!secret) return { ok: false, reason: 'unavailable' }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
    })
    const clientIp = getClientIp(request)
    if (clientIp !== 'unknown') body.set('remoteip', clientIp)

    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: controller.signal,
    })

    if (!response.ok) return { ok: false, reason: 'unavailable' }

    const result = (await response.json()) as SiteverifyResponse
    if (
      result.success !== true ||
      result.action !== EXPECTED_ACTION ||
      !result.hostname ||
      !allowedHostnames(request).has(result.hostname)
    ) {
      return { ok: false, reason: 'invalid' }
    }

    return { ok: true }
  } catch {
    return { ok: false, reason: 'unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}
