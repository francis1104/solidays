import { getCloudflareContext } from '@opennextjs/cloudflare'

export const dynamic = 'force-dynamic'

type MediaRouteContext = {
  params: Promise<{ key: string[] }>
}

function isAllowedMediaKey(key: string) {
  return /^(?:fnds|profile)\/[A-Za-z0-9._/-]+$/.test(key) && !key.includes('..')
}

export async function GET(_request: Request, { params }: MediaRouteContext) {
  const key = (await params).key.join('/')

  if (!isAllowedMediaKey(key)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    const { env } = getCloudflareContext()
    const object = await env.MEDIA_BUCKET.get(key)

    if (!object) {
      return new Response('Not found', { status: 404 })
    }

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=31536000, immutable')

    return new Response(object.body, { headers })
  } catch (error) {
    console.error('Failed to read media object from R2', { key, error })
    return new Response('Media service unavailable', { status: 503 })
  }
}
