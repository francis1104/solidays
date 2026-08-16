import { describe, expect, it } from 'vitest'
import { CARD_WIDTHS, isAllowedMediaKey } from '@/lib/media'

describe('isAllowedMediaKey', () => {
  it('allows fnds and profile prefixes', () => {
    expect(isAllowedMediaKey('fnds/card.jpg')).toBe(true)
    expect(isAllowedMediaKey('profile/avatar.jpg')).toBe(true)
    expect(isAllowedMediaKey('fnds/nested/dir/photo.webp')).toBe(true)
  })

  it('rejects other prefixes', () => {
    expect(isAllowedMediaKey('secret/key.jpg')).toBe(false)
    expect(isAllowedMediaKey('profiled/avatar.jpg')).toBe(false)
    expect(isAllowedMediaKey('fnds/')).toBe(false)
    expect(isAllowedMediaKey('')).toBe(false)
  })

  it('rejects traversal attempts', () => {
    expect(isAllowedMediaKey('fnds/../secret')).toBe(false)
    expect(isAllowedMediaKey('profile/..')).toBe(false)
    // 防御是按子串做的，文件名中间的连续两点也会被拒绝
    expect(isAllowedMediaKey('fnds/a..b.jpg')).toBe(false)
  })
})

describe('CARD_WIDTHS', () => {
  it('matches the loader and route contract', () => {
    expect([...CARD_WIDTHS]).toEqual([320, 480, 640])
  })
})
