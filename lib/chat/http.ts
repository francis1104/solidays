export function jsonResponse<T>(body: T, status = 200, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')

  return new Response(JSON.stringify(body), {
    ...init,
    status,
    headers,
  })
}

export function emptyResponse(status = 204, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('cache-control', 'no-store')

  return new Response(null, {
    ...init,
    status,
    headers,
  })
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  init: ResponseInit = {}
): Response {
  return jsonResponse({ error: { code, message } }, status, init)
}
