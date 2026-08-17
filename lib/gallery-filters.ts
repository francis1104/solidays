import type { GalleryItem } from '@/data/gallery'

export const FEATURED_GAME_NAMES = [
  'Atomic Heart',
  "Baldur's Gate 3",
  'THE FINALS',
  'Yakuza 0',
  'Street Fighter 6',
  'Split Fiction',
] as const

function compareNewest(a: GalleryItem, b: GalleryItem) {
  const byDate = new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()
  if (byDate !== 0) return byDate
  return b.id.localeCompare(a.id)
}

export function sortGalleryItems(items: readonly GalleryItem[]) {
  return [...items].sort(compareNewest)
}

export function filterGalleryItems(
  items: readonly GalleryItem[],
  options: { year: string; query: string }
) {
  const query = options.query.trim().toLowerCase()

  return items
    .filter((item) => {
      if (options.year !== 'all' && !item.recordedAt.startsWith(options.year)) {
        return false
      }

      if (!query) return true

      const text = `${item.game ?? ''} ${item.title}`.toLowerCase()
      return text.includes(query)
    })
    .sort(compareNewest)
}

export function getAvailableYears(items: readonly GalleryItem[]) {
  return [...new Set(items.map((item) => item.recordedAt.slice(0, 4)))].sort((a, b) =>
    b.localeCompare(a)
  )
}

export function getYearSpan(items: readonly GalleryItem[]) {
  if (items.length === 0) {
    return { start: '', end: '' }
  }

  const years = items.map((item) => item.recordedAt.slice(0, 4)).sort()
  return { start: years[0], end: years[years.length - 1] }
}

export function getNewestItem(items: readonly GalleryItem[]) {
  return sortGalleryItems(items)[0]
}

export function getFeaturedItems(items: readonly GalleryItem[]) {
  const newestFirst = sortGalleryItems(items)
  const featured: GalleryItem[] = []

  for (const name of FEATURED_GAME_NAMES) {
    const match = newestFirst.find((item) => item.game === name)
    if (match) featured.push(match)
  }

  return featured
}

export function findItemById(items: readonly GalleryItem[], id: string | null) {
  if (!id) return undefined
  return items.find((item) => item.id === id)
}
