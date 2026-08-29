import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type MediaRouteContext = {
  params: Promise<{ key: string[] }>
}

const CARD_WIDTHS = [320, 480, 640] as const

function isAllowedMediaKey(key: string) {
  return /^(?:fnds|profile|music)\/[A-Za-z0-9._/-]+$/.test(key) && !key.includes('..')
}

function getRangeBounds(rangeHeader: string, size: number) {
  if (size <= 0) return null

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match) return null

  const [, startValue, endValue] = match
  let offset: number
  let end: number

  if (!startValue) {
    const suffixLength = Number(endValue)
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null
    offset = Math.max(size - suffixLength, 0)
    end = size - 1
  } else {
    offset = Number(startValue)
    if (!Number.isFinite(offset) || offset < 0 || offset >= size) return null
    end = endValue ? Number(endValue) : size - 1
    if (!Number.isFinite(end) || end < offset) return null
    end = Math.min(end, size - 1)
  }

  return { offset, length: end - offset + 1, end }
}

function getCardTransform(request: Request) {
  const url = new URL(request.url)

  if (url.searchParams.get('variant') !== 'card') {
    return null
  }

  const requestedWidth = Number.parseInt(url.searchParams.get('width') ?? '', 10)
  const width = CARD_WIDTHS.find((candidate) => candidate >= requestedWidth) ?? CARD_WIDTHS.at(-1)!
  const quality = width === 320 ? 72 : width === 480 ? 76 : 80

  return { width, quality }
}

export async function GET(request: Request, { params }: MediaRouteContext) {
  const key = (await params).key.join('/')

  if (!isAllowedMediaKey(key)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const { env } = getCloudflareContext()
    const isMusic = key.startsWith('music/')
    const rangeHeader = isMusic ? request.headers.get('range') : null
    const object = await env.MEDIA_BUCKET.get(
      key,
      rangeHeader ? { range: request.headers } : undefined
    )

    if (!object) {
      return new Response('Not found', { status: 404 })
    }

    const cardTransform = getCardTransform(request)

    if (cardTransform && env.IMAGES) {
      try {
        const transformed = await env.IMAGES.input(object.body)
          .transform({
            width: cardTransform.width,
            height: cardTransform.width,
            fit: 'cover',
          })
          .output({
            format: 'image/webp',
            quality: cardTransform.quality,
          })
        const response = transformed.response()
        const headers = new Headers(response.headers)
        headers.set('cache-control', 'public, max-age=31536000, immutable')
        headers.set('x-content-type-options', 'nosniff')

        return new Response(response.body, { status: response.status, headers })
      } catch (error) {
        console.error('Failed to transform media object', { key, error })
        return new Response('Media transformation unavailable', { status: 503 })
      }
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=31536000, immutable')

    if (isMusic) {
      headers.set('accept-ranges', 'bytes')
      headers.set('content-length', String(object.size))

      if (rangeHeader) {
        const range = getRangeBounds(rangeHeader, object.size)

        if (range) {
          headers.set('content-range', `bytes ${range.offset}-${range.end}/${object.size}`)
          headers.set('content-length', String(range.length))

          return new Response(object.body, { status: 206, headers })
        }
      }
    }

    return new Response(object.body, { headers })
  } catch (error) {
    console.error('Failed to read media object from R2', { key, error })
    return new Response('Media service unavailable', { status: 503 })
  }
}
