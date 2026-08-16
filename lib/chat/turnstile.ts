import { canonicalHostname } from '@/lib/constants'
import { getClientIp } from './security'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const EXPECTED_ACTION = 'chat_message'

type SiteverifyResponse = {
  success?: boolean
  action?: string
  hostname?: string
}

export type TurnstileResult = { ok: true } | { ok: false; reason: 'invalid' | 'unavailable' }

function allowedHostnames(request: Request, allowLocalDevelopment = false): Set<string> {
  const url = new URL(request.url)
  const hostname = url.hostname
  const hostnames = new Set([hostname])

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') {
    hostnames.add('localhost')
    hostnames.add('127.0.0.1')
  }

  // wrangler custom domains rewrite local requests to solidays.win。
  // CHAT_LOCAL_DEV 只应通过 `worker:dev --var CHAT_LOCAL_DEV:true` 注入本地环境，
  // 绝不能写入 wrangler.jsonc vars 或生产 Worker 配置；这里叠加 http 协议判断作为
  // 硬性防线——生产流量恒为 https，即使该 var 被误配也不会放宽 hostname 校验。
  if (allowLocalDevelopment && url.protocol === 'http:') {
    hostnames.add('localhost')
    hostnames.add('127.0.0.1')
    hostnames.add(canonicalHostname)
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
      !allowedHostnames(request, String(env.CHAT_LOCAL_DEV) === 'true').has(result.hostname)
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
