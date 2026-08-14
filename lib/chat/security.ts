const canonicalHostname = 'solidays.win'
const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]'])

export function isAllowedOrigin(request: Request, allowLocalDevelopment = false): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    const requestUrl = new URL(request.url)
    const originUrl = new URL(origin)

    if (
      allowLocalDevelopment &&
      requestUrl.protocol === 'http:' &&
      originUrl.protocol === 'http:'
    ) {
      return (
        (requestUrl.hostname === canonicalHostname || localHostnames.has(requestUrl.hostname)) &&
        (originUrl.hostname === canonicalHostname || localHostnames.has(originUrl.hostname))
      )
    }

    if (originUrl.origin !== requestUrl.origin) return false

    if (requestUrl.hostname === canonicalHostname) {
      return requestUrl.protocol === 'https:' && originUrl.hostname === canonicalHostname
    }

    return localHostnames.has(requestUrl.hostname) && originUrl.hostname === requestUrl.hostname
  } catch {
    return false
  }
}

export function getClientIp(request: Request): string {
  const cloudflareIp = request.headers.get('CF-Connecting-IP')?.trim()
  return cloudflareIp && cloudflareIp.length <= 128 ? cloudflareIp : 'unknown'
}

export function normalizePageUrl(value: string | null, request: Request): string | null {
  if (!value) return null

  try {
    const requestUrl = new URL(request.url)
    const pageUrl = new URL(value, request.url)

    if (pageUrl.origin !== requestUrl.origin) return null

    const normalized = pageUrl.pathname + pageUrl.search
    return normalized.length <= 2048 ? normalized : null
  } catch {
    return null
  }
}
