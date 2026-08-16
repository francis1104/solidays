import { NextRequest, NextResponse } from 'next/server'
import { alternateHostname, canonicalHostname } from '@/lib/constants'

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname.toLowerCase() !== alternateHostname) {
    const response = NextResponse.next()

    if (request.nextUrl.protocol === 'https:') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    return response
  }

  const canonicalUrl = request.nextUrl.clone()
  canonicalUrl.hostname = canonicalHostname
  canonicalUrl.port = ''

  return NextResponse.redirect(canonicalUrl, 308)
}

export const config = {
  matcher: ['/:path*'],
}
