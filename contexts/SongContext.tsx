'use client'

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react'
import { defaultCards, type Card } from '@/data/cards'

type Song = {
  id: string
  title: string
  artist: string
  url: string
  cover?: string
}

type SongContextType = {
  cards: Card[]
  songQueue: Song[]
  addToSongQueue: (songs: Song[], currentSong?: Song) => void
}

const SongContext = createContext<SongContextType | undefined>(undefined)

export function SongProvider({ children }: { children: ReactNode }) {
  // Keep the music lookup aligned with the single static card shown on the homepage.
  const cards = defaultCards
  const [songQueue, setSongQueue] = useState<Song[]>([])

  // 从localStorage加载队列
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedQueue = localStorage.getItem('musicQueue')
        if (savedQueue) {
          const parsedQueue = JSON.parse(savedQueue)
          setSongQueue(parsedQueue)
        }
      } catch (error) {
        console.error('加载音乐队列失败:', error)
      }
    }
  }, [])

  // 保存队列到localStorage
  const saveQueueToStorage = (queue: Song[]) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('musicQueue', JSON.stringify(queue))
      } catch (error) {
        console.error('保存音乐队列失败:', error)
      }
    }
  }

  const addToSongQueue = (songs: Song[], currentSong?: Song) => {
    setSongQueue((prevQueue) => {
      let newQueue = [...prevQueue]

      // 添加新歌曲到队列末尾（后进入），避免重复
      songs.forEach((newSong) => {
        const exists = newQueue.some(
          (song) => song.title === newSong.title && song.artist === newSong.artist
        )
        if (!exists) {
          newQueue.push(newSong) // 新歌曲添加到队列末尾
        }
      })

      // 如果有当前播放的歌曲，确保它不会被移除
      if (currentSong) {
        const currentSongInQueue = newQueue.findIndex(
          (song) => song.title === currentSong.title && song.artist === currentSong.artist
        )

        // 如果当前播放的歌曲不在新队列中，将其添加到队列末尾
        if (currentSongInQueue === -1) {
          newQueue.push(currentSong)
        }
      }

      // 限制队列大小为20首，但保护当前播放的歌曲
      // 队列模式：后进入的挤掉最早的，所以从队列头部移除
      if (newQueue.length > 20) {
        if (currentSong) {
          const protectedSongIndex = newQueue.findIndex(
            (song) => song.title === currentSong.title && song.artist === currentSong.artist
          )

          // 如果当前播放的歌曲在队列中，先将其取出
          let protectedSong: Song | null = null
          if (protectedSongIndex !== -1) {
            protectedSong = newQueue.splice(protectedSongIndex, 1)[0]
          }

          // 从队列头部移除最早的歌曲，直到只剩19首
          newQueue = newQueue.slice(newQueue.length - 19)

          // 将保护的歌曲重新添加到队列末尾
          if (protectedSong) {
            newQueue.push(protectedSong)
          }
        } else {
          // 如果没有当前播放的歌曲，从队列头部移除最早的歌曲
          newQueue = newQueue.slice(newQueue.length - 20)
        }
      }

      // 保存到localStorage
      saveQueueToStorage(newQueue)

      return newQueue
    })
  }

  return (
    <SongContext.Provider value={{ cards, songQueue, addToSongQueue }}>
      {children}
    </SongContext.Provider>
  )
}

export function useSongContext() {
  const context = useContext(SongContext)
  if (context === undefined) {
    throw new Error('useSongContext must be used within a SongProvider')
  }
  return context
}
