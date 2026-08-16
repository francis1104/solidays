import { NextRequest, NextResponse } from 'next/server'

const canonicalHostname = 'solidays.win'
const alternateHostname = 'www.solidays.win'

export function middleware(request: NextRequest) {
  if (request.nextUrl.hostname.toLowerCase() !== alternateHostname) {
    return NextResponse.next()
  }

  const canonicalUrl = request.nextUrl.clone()
  canonicalUrl.hostname = canonicalHostname
  canonicalUrl.port = ''

  return NextResponse.redirect(canonicalUrl, 308)
}

export const config = {
  matcher: ['/:path*'],
}
