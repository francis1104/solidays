const basePath = process.env.BASE_PATH || ''

const siteMetadata = {
  title: 'Solidays',
  author: 'Francis',
  headerTitle: 'Solidays',
  description: 'money is fake, Eason is FOREVER!',
  language: 'en-us',
  theme: 'dark',
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  siteLogo: `${basePath}/static/favicons/favicon.svg`,
  socialBanner: `${basePath}/static/favicons/web-app-manifest-512x512.png`,
  email: '1104179197@qq.com',
  github: 'https://github.com/francis1104/tailwind-nextjs-starter-blog',
  stickyNav: false,
}

module.exports = siteMetadata
