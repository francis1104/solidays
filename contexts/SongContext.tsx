'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { defaultCards, type Card } from '@/data/cards'
import {
  audioCache,
  canPlayCard as cardCanPlay,
  playSongNow,
  resolveCardAudioCached,
  songFromR2,
  type Song,
} from '@/lib/music'

type SongContextType = {
  cards: Card[]
  activeCardId: number
  setActiveCardId: (id: number) => void
  currentSong: Song | null
  requestPlay: (cardId: number) => void | Promise<void>
  canPlayCard: (cardId: number) => boolean
  songQueue: Song[]
  addToSongQueue: (songs: Song[], currentSong?: Song) => void
  pause: () => void
  isPlaying: boolean
}

const SongContext = createContext<SongContextType | undefined>(undefined)

function songKey(song: Song) {
  return song.id
}

function dropStaleApiSongs(queue: Song[]) {
  return queue.filter((song) => {
    if (song.source !== 'api') return true
    const card = defaultCards.find(
      (item) => item.song === song.title || `api:${item.song}` === song.id
    )
    return !card?.audioKey
  })
}

export function SongProvider({ children }: { children: ReactNode }) {
  const cards = defaultCards
  const [activeCardId, setActiveCardId] = useState(defaultCards[0]?.id ?? 0)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [songQueue, setSongQueue] = useState<Song[]>([])
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let audio: HTMLAudioElement | undefined
    let intervalId: number | undefined

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    const attach = () => {
      const next = window.globalAudioPlayer
      if (!next || next === audio) return
      audio?.removeEventListener('play', onPlay)
      audio?.removeEventListener('pause', onPause)
      audio?.removeEventListener('ended', onPause)
      audio = next
      audio.addEventListener('play', onPlay)
      audio.addEventListener('pause', onPause)
      audio.addEventListener('ended', onPause)
      setIsPlaying(!audio.paused && !audio.ended)
      if (intervalId !== undefined) {
        window.clearInterval(intervalId)
        intervalId = undefined
      }
    }

    attach()
    intervalId = window.setInterval(attach, 400)

    return () => {
      if (intervalId !== undefined) window.clearInterval(intervalId)
      audio?.removeEventListener('play', onPlay)
      audio?.removeEventListener('pause', onPause)
      audio?.removeEventListener('ended', onPause)
    }
  }, [])

  const pause = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.globalAudioPlayer?.pause()
    }
    setIsPlaying(false)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const savedQueue = localStorage.getItem('musicQueue')
      if (!savedQueue) return
      const parsedQueue = JSON.parse(savedQueue) as Song[]
      setSongQueue(dropStaleApiSongs(parsedQueue))
    } catch {
      // Ignore malformed persisted state and keep the in-memory queue empty.
    }
  }, [])

  const saveQueueToStorage = (queue: Song[]) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('musicQueue', JSON.stringify(queue))
    } catch {
      // Ignore storage failures; music playback should remain non-blocking.
    }
  }

  const addToSongQueue = useCallback((songs: Song[], playing?: Song) => {
    setSongQueue((prevQueue) => {
      let newQueue = [...prevQueue]

      songs.forEach((newSong) => {
        const exists = newQueue.some((song) => songKey(song) === songKey(newSong))
        if (!exists) newQueue.push(newSong)
      })

      if (playing) {
        const currentSongInQueue = newQueue.findIndex((song) => songKey(song) === songKey(playing))
        if (currentSongInQueue === -1) newQueue.push(playing)
      }

      if (newQueue.length > 20) {
        if (playing) {
          const protectedSongIndex = newQueue.findIndex(
            (song) => songKey(song) === songKey(playing)
          )
          let protectedSong: Song | null = null
          if (protectedSongIndex !== -1) {
            protectedSong = newQueue.splice(protectedSongIndex, 1)[0]
          }
          newQueue = newQueue.slice(newQueue.length - 19)
          if (protectedSong) newQueue.push(protectedSong)
        } else {
          newQueue = newQueue.slice(newQueue.length - 20)
        }
      }

      saveQueueToStorage(newQueue)
      return newQueue
    })
  }, [])

  const isPlayingSong = useCallback(
    (id: string) => {
      if (!currentSong || currentSong.id !== id) return false
      if (typeof window === 'undefined') return false
      const audio = window.globalAudioPlayer
      return Boolean(audio && !audio.paused && !audio.ended && audio.src)
    },
    [currentSong]
  )

  const commitCurrentSong = useCallback(
    (song: Song) => {
      setCurrentSong(song)
      addToSongQueue([song], song)
    },
    [addToSongQueue]
  )

  const requestPlay = useCallback(
    (cardId: number) => {
      const card = cards.find((item) => item.id === cardId)
      if (!card) return

      if (card.audioKey) {
        const song = songFromR2(card)
        audioCache.set(card.id, song)
        if (isPlayingSong(song.id)) return
        void playSongNow(song)?.catch(() => {
          /* gesture may be spent on API miss only; src is set for Dock Play */
        })
        commitCurrentSong(song)
        return
      }

      const cached = audioCache.get(cardId)
      if (cached) {
        if (isPlayingSong(cached.id)) return
        void playSongNow(cached)?.catch(() => undefined)
        commitCurrentSong(cached)
        return
      }

      if (!process.env.NEXT_PUBLIC_MUSIC_API_URL) return

      void resolveCardAudioCached(card).then((song) => {
        if (!song) return
        if (isPlayingSong(song.id)) {
          commitCurrentSong(song)
          return
        }
        void playSongNow(song)?.catch(() => {
          /* 手势已过；src 已设、currentSong 已提交；Dock Play 是退路 */
        })
        commitCurrentSong(song)
      })
    },
    [cards, commitCurrentSong, isPlayingSong]
  )

  const canPlayCard = useCallback((cardId: number) => cardCanPlay(cardId, cards), [cards])

  const value = useMemo(
    () => ({
      cards,
      activeCardId,
      setActiveCardId,
      currentSong,
      requestPlay,
      canPlayCard,
      songQueue,
      addToSongQueue,
      pause,
      isPlaying,
    }),
    [
      cards,
      activeCardId,
      currentSong,
      requestPlay,
      canPlayCard,
      songQueue,
      addToSongQueue,
      pause,
      isPlaying,
    ]
  )

  return <SongContext.Provider value={value}>{children}</SongContext.Provider>
}

export function useSongContext() {
  const context = useContext(SongContext)
  if (context === undefined) {
    throw new Error('useSongContext must be used within a SongProvider')
  }
  return context
}
