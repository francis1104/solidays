import { privateMediaUrl } from './media.ts'
import { defaultCards, type Card } from '../data/cards.ts'

export type Song = {
  id: string
  title: string
  artist: string
  url: string
  cover?: string
  source: 'r2' | 'api'
}

/**
 * An HTMLMediaElement can report NaN or Infinity while metadata is unavailable
 * or the source has no known end. Keep those sentinel values out of UI state.
 */
export function finiteMediaTime(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null
}

export function formatMediaTime(time: number | null): string {
  if (time === null || !Number.isFinite(time) || time < 0) return '--:--'

  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

declare global {
  interface Window {
    globalAudioPlayer?: HTMLAudioElement
  }
}

const musicApiUrl = process.env.NEXT_PUBLIC_MUSIC_API_URL

type MusicApiResponse = {
  code: number
  data?: {
    song_name: string
    song_singer: string
    music_url: string
    cover?: string
  } | null
}

/** 唯一实例。prefetch 与 requestPlay 都读写它。 */
export const audioCache = new Map<number, Song>()

const inflight = new Map<number, Promise<Song | null>>()

export function isEason(artist: string) {
  return (
    artist.includes('陳奕迅') ||
    artist.includes('陈奕迅') ||
    artist.includes('Eason') ||
    artist.includes('Eason Chan')
  )
}

export function songFromR2(card: Card): Song {
  if (!card.audioKey) {
    throw new Error('songFromR2 requires audioKey')
  }

  return {
    id: `r2:${card.audioKey}`,
    title: card.song,
    artist: card.artist ?? '陳奕迅',
    url: privateMediaUrl(card.audioKey),
    cover: card.coverKey ? privateMediaUrl(card.coverKey) : undefined,
    source: 'r2',
  }
}

export function canPlayCard(cardId: number, cards: readonly Card[] = defaultCards) {
  const card = cards.find((item) => item.id === cardId)
  if (!card) return false
  if (card.audioKey) return true
  return Boolean(musicApiUrl)
}

export function hasAnyPlayableSource(cards: readonly Card[] = defaultCards) {
  return cards.some((card) => Boolean(card.audioKey)) || Boolean(musicApiUrl)
}

export function playSongNow(song: Song) {
  if (typeof window === 'undefined') return
  const audio = window.globalAudioPlayer ?? new Audio()
  window.globalAudioPlayer = audio
  audio.preload = 'metadata'
  audio.setAttribute('playsinline', 'true')
  audio.crossOrigin = 'anonymous'
  if (audio.src !== song.url) {
    audio.src = song.url
  }
  return audio.play()
}

async function fetchSongInfo(songName: string): Promise<Omit<Song, 'source'> | null> {
  if (!musicApiUrl) return null

  try {
    const endpoint = new URL(musicApiUrl)
    endpoint.searchParams.set('msg', songName)
    endpoint.searchParams.set('type', 'json')
    endpoint.searchParams.set('n', '1')
    const response = await fetch(endpoint)

    if (!response.ok) return null

    const data = (await response.json()) as MusicApiResponse
    if (data.code !== 200 || !data.data) return null

    return {
      id: `api:${songName}`,
      title: data.data.song_name,
      artist: data.data.song_singer,
      url: data.data.music_url,
      cover: data.data.cover,
    }
  } catch {
    return null
  }
}

export async function resolveCardAudio(card: Card): Promise<Song | null> {
  if (card.audioKey) {
    return songFromR2(card)
  }

  const raw = await fetchSongInfo(card.song)
  if (!raw || !isEason(raw.artist)) return null

  return { ...raw, id: `api:${card.song}`, source: 'api' }
}

export function resolveCardAudioCached(card: Card): Promise<Song | null> {
  const hit = audioCache.get(card.id)
  if (hit) return Promise.resolve(hit)

  const pending = inflight.get(card.id)
  if (pending) return pending

  const p = resolveCardAudio(card)
    .then((song) => {
      if (song) audioCache.set(card.id, song)
      return song
    })
    .finally(() => {
      inflight.delete(card.id)
    })

  inflight.set(card.id, p)
  return p
}
