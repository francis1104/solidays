import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatAriaDate,
  formatClipDate,
  formatClipPosition,
  formatDuration,
  formatIndexNumber,
  formatLightboxMeta,
  gameInitials,
  playClipLabel,
} from './gallery-format.ts'

describe('formatDuration', () => {
  it('formats card durations without padded minutes', () => {
    assert.equal(formatDuration(59.4), '0:59')
    assert.equal(formatDuration(87.3), '1:27')
    assert.equal(formatDuration(6.2), '0:06')
  })

  it('pads minutes for index and lightbox', () => {
    assert.equal(formatDuration(59.4, true), '00:59')
    assert.equal(formatDuration(87.3, true), '01:27')
  })
})

describe('formatClipDate', () => {
  it('formats archive dates in uppercase month day year', () => {
    assert.equal(formatClipDate('2023-02-26'), 'FEB 26 2023')
    assert.equal(formatClipDate('2025-07-08'), 'JUL 08 2025')
  })

  it('does not shift the calendar day for date-only values', () => {
    assert.equal(formatClipDate('2022-12-08'), 'DEC 08 2022')
  })
})

describe('formatAriaDate', () => {
  it('keeps a readable title-case date for labels', () => {
    assert.equal(formatAriaDate('2023-02-26'), 'Feb 26 2023')
  })
})

describe('formatLightboxMeta', () => {
  it('joins date, padded duration, and type', () => {
    assert.equal(formatLightboxMeta('2025-07-08', 59.1, 'gaming'), 'JUL 08 2025 · 00:59 · GAMING')
  })
})

describe('formatIndexNumber', () => {
  it('uses a 3-digit catalog number', () => {
    assert.equal(formatIndexNumber(0), '001')
    assert.equal(formatIndexNumber(11), '012')
  })
})

describe('formatClipPosition', () => {
  it('shows the current clip against the total', () => {
    assert.equal(formatClipPosition(11, 82), '12 / 82')
  })
})

describe('gameInitials', () => {
  it('uses the first letters of the main words', () => {
    assert.equal(gameInitials('Atomic Heart'), 'AH')
    assert.equal(gameInitials("Baldur's Gate 3"), 'BG')
    assert.equal(gameInitials('THE FINALS'), 'TF')
    assert.equal(gameInitials('Yakuza 0'), 'Y0')
    assert.equal(gameInitials('Street Fighter 6'), 'SF')
    assert.equal(gameInitials('Split Fiction'), 'SF')
  })
})

describe('playClipLabel', () => {
  it('describes the clip for assistive tech', () => {
    assert.equal(playClipLabel('Atomic Heart', '2023-02-26'), 'Play Atomic Heart clip recorded Feb 26 2023')
  })
})
