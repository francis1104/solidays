import { MetadataRoute } from 'next'
import siteMetadata from '@/data/siteMetadata'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = siteMetadata.siteUrl
  const routes = ['', 'gallery', 'fnds', 'about'].map((route) => ({
    url: `${siteUrl}/${route}`,
    lastModified: new Date(),
  }))

  return routes
}
