import 'css/tailwind.css'

import { Oswald, Space_Grotesk } from 'next/font/google'
import Header from '@/components/Header'
import SectionContainer from '@/components/SectionContainer'
import MusicDock from '@/components/MusicDock'
import siteMetadata from '@/data/siteMetadata'
import Meteors from '@/components/magicui/meteors'
import { ThemeProviders } from './theme-providers'
import { SongProvider } from '@/contexts/SongContext'
import FloatingChat from '@/components/chat/floating-chat'
import { Metadata } from 'next'

const space_grotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-space-grotesk',
})

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-oswald',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteMetadata.siteUrl),
  title: {
    default: siteMetadata.title,
    template: `%s | ${siteMetadata.title}`,
  },
  description: siteMetadata.description,
  openGraph: {
    title: siteMetadata.title,
    description: siteMetadata.description,
    url: './',
    siteName: siteMetadata.title,
    images: siteMetadata.socialBanner ? [siteMetadata.socialBanner] : undefined,
    locale: 'en_US',
    type: 'website',
  },
  alternates: {
    canonical: './',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  twitter: {
    title: siteMetadata.title,
    card: 'summary_large_image',
    images: siteMetadata.socialBanner ? [siteMetadata.socialBanner] : undefined,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const basePath = process.env.BASE_PATH || ''

  return (
    <html
      lang={siteMetadata.language}
      className={`${space_grotesk.variable} ${oswald.variable} scroll-smooth`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <link rel="icon" type="image/png" href="/static/favicons/favicon-96x96.png" sizes="96x96" />
      <link rel="icon" type="image/svg+xml" href="/static/favicons/favicon.svg" />
      <link rel="shortcut icon" href="/static/favicons/favicon.ico" />
      <link rel="apple-touch-icon" sizes="180x180" href="/static/favicons/apple-touch-icon.png" />
      <meta name="apple-mobile-web-app-title" content="EF site" />
      <link rel="manifest" href={`${basePath}/static/favicons/site.webmanifest`} />
      <link
        rel="mask-icon"
        href={`${basePath}/static/favicons/safari-pinned-tab.svg`}
        color="#5bbad5"
      />
      <meta name="msapplication-TileColor" content="#000000" />
      <meta name="theme-color" media="(prefers-color-scheme: light)" content="#fff" />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#000" />
      <body className="bg-white pl-[calc(100vw-100%)] text-black antialiased dark:bg-gray-950 dark:text-white">
        <Meteors number={24} className="pointer-events-none fixed inset-0 z-0 h-full w-full" />
        <ThemeProviders>
          <SongProvider>
            <SectionContainer>
              <Header />
              <main className="flex min-h-0 flex-1 flex-col">{children}</main>
            </SectionContainer>
            <MusicDock />
          </SongProvider>
          <FloatingChat />
        </ThemeProviders>
      </body>
    </html>
  )
}
