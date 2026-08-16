import { getCloudflareContext } from '@opennextjs/cloudflare'
import { CARD_WIDTHS, isAllowedMediaKey, type CardWidth } from '@/lib/media'

export const dynamic = 'force-dynamic'

type MediaRouteContext = {
  params: Promise<{ key: string[] }>
}

function getCardTransform(
  request: Request
): { width: CardWidth; quality: number } | 'invalid' | null {
  const url = new URL(request.url)

  if (url.searchParams.get('variant') !== 'card') {
    return null
  }

  const requestedWidth = Number.parseInt(url.searchParams.get('width') ?? '', 10)
  if (!CARD_WIDTHS.some((candidate) => candidate === requestedWidth)) {
    return 'invalid'
  }

  const width = requestedWidth as CardWidth
  const quality = width === 320 ? 72 : width === 480 ? 76 : 80

  return { width, quality }
}

function buildNotModifiedResponse(etag: string) {
  return new Response(null, {
    status: 304,
    headers: { etag },
  })
}

export async function GET(request: Request, { params }: MediaRouteContext) {
  const key = (await params).key.join('/')

  if (!isAllowedMediaKey(key)) {
    return new Response('Not found', { status: 404 })
  }

  const cardTransform = getCardTransform(request)
  if (cardTransform === 'invalid') {
    return new Response(`width must be one of ${CARD_WIDTHS.join(', ')}`, { status: 400 })
  }

  try {
    const { env } = getCloudflareContext()
    const object = await env.MEDIA_BUCKET.get(key)

    if (!object) {
      return new Response('Not found', { status: 404 })
    }

    if (cardTransform && env.IMAGES) {
      // 同一 (key, width) 的变体内容随 R2 原图 etag 变化，用它组成可协商的 ETag
      const variantEtag = `"card-${cardTransform.width}-${object.httpEtag}"`
      if (request.headers.get('if-none-match') === variantEtag) {
        return buildNotModifiedResponse(variantEtag)
      }

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
        headers.set('etag', variantEtag)
        headers.set('x-content-type-options', 'nosniff')

        return new Response(response.body, { status: response.status, headers })
      } catch (error) {
        console.error('Failed to transform media object', { key, error })
        return new Response('Media transformation unavailable', { status: 503 })
      }
    }

    if (request.headers.get('if-none-match') === object.httpEtag) {
      return buildNotModifiedResponse(object.httpEtag)
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=31536000, immutable')
    headers.set('x-content-type-options', 'nosniff')

    return new Response(object.body, { headers })
  } catch (error) {
    console.error('Failed to read media object from R2', { key, error })
    return new Response('Media service unavailable', { status: 503 })
  }
}
