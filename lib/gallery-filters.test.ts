import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { galleryItems } from '../data/gallery.ts'
import {
  FEATURED_GAME_NAMES,
  filterGalleryItems,
  findItemById,
  getAvailableYears,
  getFeaturedItems,
  getNewestItem,
  getYearSpan,
  sortGalleryItems,
} from './gallery-filters.ts'
import type { GalleryItem } from '../data/gallery.ts'

const sample: GalleryItem[] = [
  {
    id: 'atomic-heart-20230226-064348',
    type: 'gaming',
    title: 'Atomic Heart',
    game: 'Atomic Heart',
    recordedAt: '2023-02-26',
    video: '/gaming/atomic-heart-20230226-064348.mp4',
    poster: '/gaming/atomic-heart-20230226-064348.webp',
    width: 1920,
    height: 1080,
    duration: 59.4,
  },
  {
    id: 'street-fighter-6-20250708-150434',
    type: 'gaming',
    title: 'Street Fighter 6',
    game: 'Street Fighter 6',
    recordedAt: '2025-07-08',
    video: '/gaming/street-fighter-6-20250708-150434.mp4',
    poster: '/gaming/street-fighter-6-20250708-150434.webp',
    width: 1920,
    height: 1080,
    duration: 59.1,
  },
  {
    id: 'persona-5-royal-20221112-164307',
    type: 'gaming',
    title: 'Persona 5 Royal',
    game: 'Persona 5 Royal',
    recordedAt: '2022-11-12',
    video: '/gaming/persona-5-royal-20221112-164307.mp4',
    poster: '/gaming/persona-5-royal-20221112-164307.webp',
    width: 1920,
    height: 1080,
    duration: 29.5,
  },
]

describe('filterGalleryItems', () => {
  it('returns newest first by default', () => {
    const filtered = filterGalleryItems(sample, { year: 'all', query: '' })
    assert.deepEqual(
      filtered.map((item) => item.id),
      [
        'street-fighter-6-20250708-150434',
        'atomic-heart-20230226-064348',
        'persona-5-royal-20221112-164307',
      ]
    )
  })

  it('filters by recorded year', () => {
    const filtered = filterGalleryItems(sample, { year: '2023', query: '' })
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].id, 'atomic-heart-20230226-064348')
  })

  it('searches game and title case-insensitively', () => {
    const byGame = filterGalleryItems(sample, { year: 'all', query: 'street' })
    const byTitle = filterGalleryItems(sample, { year: 'all', query: 'PERSONA' })
    assert.equal(byGame[0].game, 'Street Fighter 6')
    assert.equal(byTitle[0].title, 'Persona 5 Royal')
  })

  it('ignores surrounding whitespace in the query', () => {
    const filtered = filterGalleryItems(sample, { year: 'all', query: '  atomic  ' })
    assert.equal(filtered.length, 1)
    assert.equal(filtered[0].game, 'Atomic Heart')
  })
})

describe('gallery catalog helpers', () => {
  it('collects years newest first', () => {
    assert.deepEqual(getAvailableYears(sample), ['2025', '2023', '2022'])
  })

  it('returns the recorded year span', () => {
    assert.deepEqual(getYearSpan(sample), { start: '2022', end: '2025' })
  })

  it('picks the newest item', () => {
    assert.equal(getNewestItem(sample)?.id, 'street-fighter-6-20250708-150434')
  })

  it('finds an item by id', () => {
    assert.equal(findItemById(sample, 'atomic-heart-20230226-064348')?.title, 'Atomic Heart')
    assert.equal(findItemById(sample, null), undefined)
  })
})

describe('real gallery catalog', () => {
  it('covers the expected year span and featured games', () => {
    assert.equal(galleryItems.length, 82)
    assert.deepEqual(getYearSpan(galleryItems), { start: '2022', end: '2025' })

    const featured = getFeaturedItems(galleryItems)
    assert.deepEqual(
      featured.map((item) => item.game),
      [...FEATURED_GAME_NAMES]
    )
  })

  it('keeps every catalog item when no filters are applied', () => {
    const filtered = filterGalleryItems(galleryItems, { year: 'all', query: '' })
    assert.equal(filtered.length, galleryItems.length)
    assert.deepEqual(filtered.map((item) => item.id), sortGalleryItems(galleryItems).map((item) => item.id))
  })
})
