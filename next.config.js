const ContentSecurityPolicy = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://challenges.cloudflare.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' https: blob: data:;
  media-src 'self' https: blob: data:;
  connect-src 'self' https:;
  font-src 'self' https: data:;
  frame-src 'self' https://challenges.cloudflare.com;
`

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: ContentSecurityPolicy.replace(/\n/g, ''),
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
]

const basePath = process.env.BASE_PATH || undefined
const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const r2Hostname = r2PublicUrl ? new URL(r2PublicUrl).hostname : undefined

/** @type {import('next').NextConfig} */
const nextConfig = {
  // OpenNext builds the default app as a Worker. Keep static export optional for local use.
  output: process.env.EXPORT ? 'export' : undefined,
  basePath,
  reactStrictMode: true,
  trailingSlash: false,
  pageExtensions: ['ts', 'tsx', 'js', 'jsx'],
  experimental: {
    optimizePackageImports: ['@headlessui/react'],
  },
  images: {
    deviceSizes: [320, 480, 640],
    imageSizes: [320, 480, 640],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dlink.host',
      },
      ...(r2Hostname ? [{ protocol: 'https', hostname: r2Hostname }] : []),
    ],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    qualities: [75, 85, 100],
    unoptimized: Boolean(process.env.UNOPTIMIZED),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        source: '/fnds',
        headers: [
          ...securityHeaders,
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=3600, max-age=3600',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
