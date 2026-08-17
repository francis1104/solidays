'use client'

import { useMemo, useState } from 'react'
import type { GalleryItem } from '@/data/gallery'
import {
  filterGalleryItems,
  findItemById,
  getAvailableYears,
  getFeaturedItems,
  getNewestItem,
  getYearSpan,
  sortGalleryItems,
} from '@/lib/gallery-filters'
import GalleryArchive from './GalleryArchive'
import GalleryHero from './GalleryHero'
import GalleryLightbox from './GalleryLightbox'

export default function Gallery({ items }: { items: GalleryItem[] }) {
  const [year, setYear] = useState('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'grid' | 'index'>('grid')
  const newest = useMemo(() => getNewestItem(items), [items])
  const featuredItems = useMemo(() => getFeaturedItems(items), [items])
  const [featuredId, setFeaturedId] = useState<string | null>(
    newest?.id ?? featuredItems[0]?.id ?? null
  )
  const [indexHoverId, setIndexHoverId] = useState<string | null>(null)
  const [lightboxId, setLightboxId] = useState<string | null>(null)

  const catalog = useMemo(() => sortGalleryItems(items), [items])
  const years = useMemo(() => getAvailableYears(items), [items])
  const yearSpan = useMemo(() => getYearSpan(items), [items])
  const filteredItems = useMemo(
    () => filterGalleryItems(items, { year, query }),
    [items, year, query]
  )

  const featuredItem = findItemById(items, featuredId) ?? newest
  const previewItem = findItemById(filteredItems, indexHoverId) ?? filteredItems[0]
  const lightboxItems =
    lightboxId && !filteredItems.some((item) => item.id === lightboxId) ? catalog : filteredItems
  const featuredIndex = featuredItem ? catalog.findIndex((item) => item.id === featuredItem.id) : 0

  if (!featuredItem) return null

  return (
    <div className="overflow-x-clip pt-2">
      <GalleryHero
        featuredItems={featuredItems}
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
