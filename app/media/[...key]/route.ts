import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type MediaRouteContext = {
  params: Promise<{ key: string[] }>
}

const CARD_WIDTHS = [320, 480, 640] as const
const GALLERY_MEDIA_BASE_URL = 'https://media.solidays.win'

function isAllowedMediaKey(key: string) {
  return (
    /^(?:fnds|profile|music|gaming|gallery-phase2)\/[A-Za-z0-9._/-]+$/.test(key) &&
    !key.includes('..')
  )
}

function isGalleryMediaKey(key: string) {
  return key.startsWith('gaming/') || key.startsWith('gallery-phase2/')
}

async function proxyGalleryMedia(request: Request, key: string) {
  const headers = new Headers()

  for (const name of ['range', 'if-range', 'if-none-match', 'if-modified-since']) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }

  return fetch(`${GALLERY_MEDIA_BASE_URL}/${key}`, {
    headers,
  })
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
    if (isGalleryMediaKey(key)) {
      const response = await proxyGalleryMedia(request, key)
      const headers = new Headers(response.headers)
      const contentLength = response.headers.get('content-length')

      if (contentLength) headers.set('content-length', contentLength)
      headers.set('accept-ranges', 'bytes')
      headers.set('cache-control', 'public, max-age=31536000, immutable')
      headers.set('x-content-type-options', 'nosniff')

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }

    const { env } = getCloudflareContext()
    const isMusic = key.startsWith('music/')
    const object = await env.MEDIA_BUCKET.get(key)

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
    }

    return new Response(object.body, { headers })
  } catch (error) {
    console.error('Failed to read media object from R2', { key, error })
    return new Response('Media service unavailable', { status: 503 })
  }
}
