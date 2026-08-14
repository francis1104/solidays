export const CHAT_COOKIE_NAME = 'chat_visitor'
const CHAT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue

    const key = part.slice(0, separator).trim()
    if (key !== name) continue

    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }

  return null
}

export function getVisitorId(request: Request): string | null {
  const value = getCookie(request, CHAT_COOKIE_NAME)
  return value && uuidPattern.test(value) ? value : null
}

export function createVisitorId(): string {
  return crypto.randomUUID()
}

export function buildVisitorCookie(visitorId: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : ''
  return [
    `${CHAT_COOKIE_NAME}=${encodeURIComponent(visitorId)}`,
    'Path=/',
    `Max-Age=${CHAT_COOKIE_MAX_AGE}`,
    'HttpOnly',
    'SameSite=Lax',
    secure.slice(2),
  ]
    .filter(Boolean)
    .join('; ')
}
