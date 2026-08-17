'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GalleryItem } from '@/data/gallery'
import {
  filterGalleryItems,
  findItemById,
  getAvailableYears,
  getHeroItems,
  getNewestItem,
  getYearSpan,
  sortGalleryItems,
} from '@/lib/gallery-filters'
import { parseGalleryUrl, serializeGalleryUrl } from '@/lib/gallery-state'
import GalleryArchive from './GalleryArchive'
import GalleryHero from './GalleryHero'
import GalleryLightbox from './GalleryLightbox'

export default function Gallery({ items }: { items: GalleryItem[] }) {
  const [year, setYear] = useState('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'index'>('grid')
  const newest = useMemo(() => getNewestItem(items), [items])
  const heroItems = useMemo(() => getHeroItems(items), [items])
  const [featuredId, setFeaturedId] = useState<string | null>(
    newest?.id ?? heroItems[0]?.id ?? null
  )
  const [indexHoverId, setIndexHoverId] = useState<string | null>(null)
  const [lightboxId, setLightboxId] = useState<string | null>(null)
  const [urlReady, setUrlReady] = useState(false)

  const catalog = useMemo(() => sortGalleryItems(items), [items])
  const years = useMemo(() => getAvailableYears(items), [items])
  const itemIds = useMemo(() => items.map((item) => item.id), [items])
  const yearSpan = useMemo(() => getYearSpan(items), [items])
  const filteredItems = useMemo(
    () => filterGalleryItems(items, { year, query }),
    [items, year, query]
  )

  useEffect(() => {
    const applyUrlState = () => {
      const next = parseGalleryUrl(window.location.href, years, itemIds)
      setYear(next.year)
      setQuery(next.query)
      setView(next.view)
      setLightboxId(next.clipId)
      setUrlReady(true)
    }

    applyUrlState()
    window.addEventListener('popstate', applyUrlState)
    return () => window.removeEventListener('popstate', applyUrlState)
  }, [itemIds, years])

  useEffect(() => {
    if (!urlReady) return

    const nextUrl = serializeGalleryUrl(window.location.href, {
      year,
      query,
      view,
      clipId: lightboxId,
    })
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [lightboxId, query, urlReady, view, year])

  const featuredItem = findItemById(items, featuredId) ?? newest
  const previewItem = findItemById(filteredItems, indexHoverId) ?? filteredItems[0]
  const lightboxItems =
    lightboxId && !filteredItems.some((item) => item.id === lightboxId) ? catalog : filteredItems
  const featuredIndex = featuredItem ? catalog.findIndex((item) => item.id === featuredItem.id) : 0

  if (!featuredItem) return null

  return (
    <div className="overflow-x-clip pt-2">
      <GalleryHero
        featuredItems={heroItems}
        featuredItem={featuredItem}
        clipCount={items.length}
        clipIndex={Math.max(featuredIndex, 0)}
        yearSpan={yearSpan}
        onFeaturedChange={setFeaturedId}
        onPlay={setLightboxId}
      />
      <GalleryArchive
        items={filteredItems}
        years={years}
        year={year}
        query={query}
        view={view}
        previewItem={previewItem}
        onYearChange={setYear}
        onQueryChange={setQuery}
        onViewChange={setView}
        onIndexHover={setIndexHoverId}
        onPlay={setLightboxId}
      />
      <GalleryLightbox
        items={lightboxItems}
        activeId={lightboxId}
        onActiveIdChange={setLightboxId}
      />
    </div>
  )
}
