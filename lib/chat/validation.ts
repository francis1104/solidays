import type { ChatMessageInput } from './types'

const MAX_BODY_BYTES = 32 * 1024
const MAX_TOKEN_LENGTH = 2048
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function readBodyWithinLimit(request: Request): Promise<string | null> {
  const reader = request.body?.getReader()
  if (!reader) return null

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalBytes += value.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel()
        return null
      }

      chunks.push(value)
    }
  } catch {
    await reader.cancel().catch(() => undefined)
    return null
  }

  const bodyBytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bodyBytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(bodyBytes)
}

export async function parseMessageInput(request: Request): Promise<ChatMessageInput | null> {
  const contentLengthHeader = request.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader)
    if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > MAX_BODY_BYTES) {
      return null
    }
  }

  let body: unknown
  try {
    const bodyText = await readBodyWithinLimit(request)
    if (bodyText === null) return null
    body = JSON.parse(bodyText)
  } catch {
    return null
  }

  if (!body || typeof body !== 'object') return null

  const record = body as Record<string, unknown>
  const content = typeof record.content === 'string' ? record.content.trim() : ''
  const pageUrl = record.pageUrl
  const turnstileToken = record.turnstileToken
  const clientMessageId = record.clientMessageId

  if ([...content].length < 1 || [...content].length > 2000) return null
  if (pageUrl !== undefined && pageUrl !== null && typeof pageUrl !== 'string') return null
  if (
    typeof turnstileToken !== 'string' ||
    turnstileToken.length < 1 ||
    turnstileToken.length > MAX_TOKEN_LENGTH
  ) {
    return null
  }
  if (
    clientMessageId !== undefined &&
    (typeof clientMessageId !== 'string' || !uuidPattern.test(clientMessageId))
  ) {
    return null
  }

  return {
    content,
    pageUrl: typeof pageUrl === 'string' ? pageUrl.slice(0, 2048) : null,
    turnstileToken,
    clientMessageId: typeof clientMessageId === 'string' ? clientMessageId : null,
  }
}
