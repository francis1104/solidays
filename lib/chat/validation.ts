import type { ChatMessageInput } from './types'

const MAX_BODY_BYTES = 32 * 1024
const MAX_TOKEN_LENGTH = 2048

export async function parseMessageInput(request: Request): Promise<ChatMessageInput | null> {
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) return null

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }

  if (!body || typeof body !== 'object') return null

  const record = body as Record<string, unknown>
  const content = typeof record.content === 'string' ? record.content.trim() : ''
  const pageUrl = record.pageUrl
  const turnstileToken = record.turnstileToken

  if ([...content].length < 1 || [...content].length > 2000) return null
  if (pageUrl !== undefined && pageUrl !== null && typeof pageUrl !== 'string') return null
  if (
    typeof turnstileToken !== 'string' ||
    turnstileToken.length < 1 ||
    turnstileToken.length > MAX_TOKEN_LENGTH
  ) {
    return null
  }

  return {
    content,
    pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 2048) : null,
    turnstileToken,
  }
}
