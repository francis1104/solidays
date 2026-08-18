export type GalleryView = 'grid' | 'index'

export type GalleryUrlState = {
  year: string
  query: string
  view: GalleryView
  clipId: string | null
}

function hashClipId(hash: string) {
  if (!hash) return null

  const value = hash.slice(1)
  if (value.startsWith('clip=')) {
    return new URLSearchParams(value).get('clip')
  }

  return null
}

export function parseGalleryUrl(
  href: string,
  availableYears: readonly string[],
  itemIds: readonly string[]
): GalleryUrlState {
  const url = new URL(href)
  const yearParam = url.searchParams.get('year')
  const year =
    yearParam === 'all' || (yearParam && availableYears.includes(yearParam)) ? yearParam : 'all'
  const clipCandidate = url.searchParams.get('clip') ?? hashClipId(url.hash)

  return {
    year,
    query: url.searchParams.get('q') ?? '',
    view: url.searchParams.get('view') === 'index' ? 'index' : 'grid',
    clipId: clipCandidate && itemIds.includes(clipCandidate) ? clipCandidate : null,
  }
}

export function serializeGalleryUrl(href: string, state: GalleryUrlState) {
  const url = new URL(href)

  if (state.year === 'all') url.searchParams.delete('year')
  else url.searchParams.set('year', state.year)

  const query = state.query.trim()
  if (query) url.searchParams.set('q', query)
  else url.searchParams.delete('q')

  if (state.view === 'index') url.searchParams.set('view', 'index')
  else url.searchParams.delete('view')

  if (state.clipId) url.searchParams.set('clip', state.clipId)
  else url.searchParams.delete('clip')

  url.hash = ''
  return `${url.pathname}${url.search}`
}
