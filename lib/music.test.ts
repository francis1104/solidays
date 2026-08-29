import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  canPlayCard,
  finiteMediaTime,
  formatMediaTime,
  isEason,
  songFromR2,
} from './music.ts'
import type { Card } from '../data/cards.ts'

const sample: Card = {
  id: 0,
  song: '歌頌',
  album: '《Solidays 新曲+精選》',
  content: 'lyric',
  artist: '陳奕迅',
  audioKey: 'music/ge-song.m4a',
  coverKey: 'music/covers/ge-song.jpg',
}

describe('isEason', () => {
  it('accepts traditional, simplified, and Eason spellings', () => {
    assert.equal(isEason('陳奕迅'), true)
    assert.equal(isEason('陈奕迅'), true)
    assert.equal(isEason('Eason Chan'), true)
    assert.equal(isEason('Eason'), true)
    assert.equal(isEason('林夕'), false)
  })
})

describe('songFromR2', () => {
  it('uses a stable r2: id and media URLs', () => {
    const song = songFromR2(sample)
    assert.equal(song.id, 'r2:music/ge-song.m4a')
    assert.equal(song.source, 'r2')
    assert.equal(song.title, '歌頌')
    assert.equal(song.artist, '陳奕迅')
    assert.equal(song.url, '/media/music/ge-song.m4a')
    assert.equal(song.cover, '/media/music/covers/ge-song.jpg')
  })
})

describe('canPlayCard', () => {
  it('is true when the card has an audioKey even without a music API', () => {
    assert.equal(canPlayCard(0, [sample]), true)
  })

  it('is false when there is no audioKey and no music API', () => {
    const silent = { ...sample, audioKey: undefined, coverKey: undefined }
    assert.equal(canPlayCard(0, [silent]), false)
  })
})

describe('media time formatting', () => {
  it('rejects unknown and infinite media durations', () => {
    assert.equal(finiteMediaTime(Number.NaN), null)
    assert.equal(finiteMediaTime(Number.POSITIVE_INFINITY), null)
    assert.equal(formatMediaTime(null), '--:--')
    assert.equal(formatMediaTime(Number.POSITIVE_INFINITY), '--:--')
  })

  it('formats finite media durations', () => {
    assert.equal(finiteMediaTime(342), 342)
    assert.equal(formatMediaTime(342), '5:42')
  })
})
