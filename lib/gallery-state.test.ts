import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseGalleryUrl, serializeGalleryUrl } from './gallery-state.ts'

const years = ['2025', '2024', '2023', '2022']
const ids = ['resident-evil-3-20250719-104612', 'atomic-heart-20230226-064348']

describe('parseGalleryUrl', () => {
  it('reads filters, view, and a valid clip from the query string', () => {
    assert.deepEqual(
      parseGalleryUrl(
        'https://solidays.win/gallery?year=2025&q=resident%20evil&view=index&clip=resident-evil-3-20250719-104612',
        years,
        ids
      ),
      {
        year: '2025',
        query: 'resident evil',
        view: 'index',
        clipId: 'resident-evil-3-20250719-104612',
      }
    )
  })

  it('supports the legacy hash form for a clip', () => {
    assert.equal(
      parseGalleryUrl('https://solidays.win/gallery#clip=atomic-heart-20230226-064348', years, ids)
        .clipId,
      'atomic-heart-20230226-064348'
    )
  })

  it('falls back to safe defaults for unknown values', () => {
    assert.deepEqual(
      parseGalleryUrl('https://solidays.win/gallery?year=2019&view=wrong&clip=missing', years, ids),
      { year: 'all', query: '', view: 'grid', clipId: null }
    )
  })
})

describe('serializeGalleryUrl', () => {
  it('writes state without adding browser history entries', () => {
    assert.equal(
      serializeGalleryUrl('https://solidays.win/gallery?utm_source=test#old', {
        year: '2025',
        query: ' resident evil ',
        view: 'index',
        clipId: 'resident-evil-3-20250719-104612',
      }),
      '/gallery?utm_source=test&year=2025&q=resident+evil&view=index&clip=resident-evil-3-20250719-104612'
    )
  })

  it('removes default values when state is reset', () => {
    assert.equal(
      serializeGalleryUrl('https://solidays.win/gallery?year=2025&q=atomic&view=index&clip=old', {
        year: 'all',
        query: '',
        view: 'grid',
        clipId: null,
      }),
      '/gallery'
    )
  })
})
