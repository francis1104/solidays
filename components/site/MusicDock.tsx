'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Dock, DockIcon } from '@/components/magicui/dock'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/components/lib/utils'
import { useSongContext } from '@/contexts/SongContext'
import { hasAnyPlayableSource, resolveCardAudioCached, type Song } from '@/lib/music'

const MusicDock = () => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [playlist, setPlaylist] = useState<Song[]>([])
  const audioRef = useRef<HTMLAudioElement>(null)
  const nextSongRef = useRef<() => Promise<void>>(async () => {})
  const savePlayerStateRef = useRef<() => void>(() => {})
  const { cards, songQueue, currentSong: playingSong, activeCardId } = useSongContext()
  const currentSong = playingSong ?? playlist[currentSongIndex]

  // 从localStorage加载播放状态
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedState = localStorage.getItem('musicPlayerState')
        if (savedState) {
          const parsedState = JSON.parse(savedState)

          if (parsedState.playlist && parsedState.playlist.length > 0) {
            setPlaylist(parsedState.playlist)
            setCurrentSongIndex(parsedState.currentSongIndex || 0)

            // 如果有保存的播放列表，延迟同步音频状态
            setTimeout(() => {
              const audio = audioRef.current
              if (audio) {
                setIsPlaying(!audio.paused && !audio.ended)
                if (
                  parsedState.currentTime &&
                  Math.abs(audio.currentTime - parsedState.currentTime) > 5
                ) {
                  audio.currentTime = parsedState.currentTime
                }
                setCurrentTime(audio.currentTime || 0)
                setDuration(audio.duration || 0)
              }
            }, 100)
          }
        }
      } catch {
        // Ignore malformed persisted state and use the default player state.
      }
    }
  }, [])

  // 保存播放状态到localStorage
  const savePlayerState = () => {
    if (typeof window !== 'undefined') {
      try {
        const audio = audioRef.current
        const state = {
          currentSongIndex,
          currentTime: audio?.currentTime || currentTime,
          playlist: playlist.slice(0, 10), // 保存前10首，避免存储过多
          isPlaying: audio ? !audio.paused && !audio.ended : isPlaying,
          currentSong: currentSong, // 保存当前歌曲的完整信息
          audioSrc: audio?.src || '', // 保存音频源URL以便对比
        }
        localStorage.setItem('musicPlayerState', JSON.stringify(state))
      } catch {
        // Ignore storage failures; they should not interrupt playback.
      }
    }
  }

  savePlayerStateRef.current = savePlayerState

  // 定期保存播放状态
  useEffect(() => {
    const interval = setInterval(() => {
      if (playlist.length > 0) {
        savePlayerStateRef.current()
      }
    }, 10000) // 每10秒保存一次

    return () => clearInterval(interval)
  }, [playlist.length])

  // 页面卸载前保存状态
  useEffect(() => {
    const handleBeforeUnload = () => {
      savePlayerStateRef.current()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // 使用全局音频实例避免页面切换时中断
  useEffect(() => {
    // 创建或复用全局音频实例
    if (typeof window !== 'undefined') {
      if (!window.globalAudioPlayer) {
        window.globalAudioPlayer = new Audio()
        window.globalAudioPlayer.preload = 'metadata'
        window.globalAudioPlayer.setAttribute('playsinline', 'true')
        window.globalAudioPlayer.crossOrigin = 'anonymous'
      }

      audioRef.current = window.globalAudioPlayer

      // 立即同步全局音频状态到本地状态
      const audio = audioRef.current
      if (audio) {
        const isCurrentlyPlaying = !audio.paused && !audio.ended
        setIsPlaying(isCurrentlyPlaying)
        setCurrentTime(audio.currentTime || 0)
        setDuration(audio.duration || 0)

        if (audio.src) {
          setTimeout(() => {
            try {
              const savedState = localStorage.getItem('musicPlayerState')
              if (savedState) {
                const parsedState = JSON.parse(savedState)

                // 优先使用保存的currentSong信息进行快速恢复
                if (parsedState.currentSong && parsedState.audioSrc === audio.src) {
                  setPlaylist([parsedState.currentSong])
                  setCurrentSongIndex(0)
                  // 如果还有完整播放列表，后续恢复
                  if (parsedState.playlist && parsedState.playlist.length > 1) {
                    setTimeout(() => {
                      setPlaylist(parsedState.playlist)
                      setCurrentSongIndex(parsedState.currentSongIndex || 0)
                    }, 500)
                  }
                } else if (parsedState.playlist && parsedState.playlist.length > 0) {
                  const savedCurrentSong = parsedState.playlist[parsedState.currentSongIndex || 0]
                  if (savedCurrentSong && savedCurrentSong.url === audio.src) {
                    setPlaylist(parsedState.playlist)
                    setCurrentSongIndex(parsedState.currentSongIndex || 0)
                  }
                }
              }
            } catch {
              // Ignore malformed persisted state and keep the current audio state.
            }
          }, 100)
        }
      }
    }
  }, [])

  // 绑定事件处理器
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleEnded = () => {
      setIsPlaying(false)
      // 使用setTimeout确保状态更新完成
      setTimeout(() => {
        void nextSongRef.current()
      }, 0)
    }
    const handleLoadedData = () => {
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    }
    const handleError = () => {
      setTimeout(() => {
        void nextSongRef.current()
      }, 0)
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('loadedmetadata', handleLoadedData)
    audio.addEventListener('durationchange', handleLoadedData)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('loadedmetadata', handleLoadedData)
      audio.removeEventListener('durationchange', handleLoadedData)
      audio.removeEventListener('error', handleError)
    }
  }, [playlist.length, currentSongIndex])
  useEffect(() => {
    const card = cards.find((item) => item.id === activeCardId)
    if (!card) return
    void resolveCardAudioCached(card)
  }, [activeCardId, cards])

  useEffect(() => {
    if (!playingSong) return
    setPlaylist((prev) => {
      if (prev.some((song) => song.id === playingSong.id)) return prev
      return [...prev, playingSong]
    })
  }, [playingSong])

  useEffect(() => {
    if (!playingSong) return
    const existing = playlist.findIndex((song) => song.id === playingSong.id)
    if (existing >= 0 && existing !== currentSongIndex) {
      setCurrentSongIndex(existing)
    }
  }, [playingSong, playlist, currentSongIndex])

  // 定期同步全局音频状态，确保组件重新挂载时状态正确
  useEffect(() => {
    const syncAudioState = () => {
      const audio = audioRef.current
      if (audio && audio.src) {
        const isCurrentlyPlaying = !audio.paused && !audio.ended
        setIsPlaying(isCurrentlyPlaying)
        setCurrentTime(audio.currentTime || 0)
        if (!isNaN(audio.duration)) {
          setDuration(audio.duration || 0)
        }

        // 如果音频有src但当前没有歌曲信息，尝试从音频重建歌曲信息
        if ((!currentSong || !playlist.length) && audio.src) {
          // 尝试从localStorage恢复当前歌曲信息
          try {
            const savedState = localStorage.getItem('musicPlayerState')
            if (savedState) {
              const parsedState = JSON.parse(savedState)

              // 优先使用保存的currentSong信息
              if (parsedState.currentSong && parsedState.audioSrc === audio.src) {
                // 直接恢复当前歌曲信息，即使playlist为空
                if (!currentSong) {
                  // 临时设置playlist和currentSongIndex来显示歌曲信息
                  setPlaylist([parsedState.currentSong])
                  setCurrentSongIndex(0)
                }
              } else if (parsedState.playlist && parsedState.playlist.length > 0) {
                const savedCurrentSong = parsedState.playlist[parsedState.currentSongIndex || 0]
                if (savedCurrentSong && savedCurrentSong.url === audio.src) {
                  setPlaylist(parsedState.playlist)
                  setCurrentSongIndex(parsedState.currentSongIndex || 0)
                }
              }
            }
          } catch {
            // Ignore malformed persisted state and keep the current audio state.
          }
        }
      }
    }

    // 立即同步一次
    syncAudioState()

    // 每秒同步一次状态，确保UI与音频状态一致
    const interval = setInterval(syncAudioState, 1000)

    return () => clearInterval(interval)
  }, [currentSong, playlist.length])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    // 如果没有播放列表或当前歌曲，尝试从队列中获取
    if (!currentSong && playlist.length === 0) {
      if (songQueue.length > 0) {
        // 从队列中选择第一首歌曲
        const selectedSong = songQueue[0]
        setPlaylist([selectedSong])
        setCurrentSongIndex(0)
        // 等待状态更新后重试播放
        setTimeout(() => {
          togglePlay()
        }, 100)
        return
      } else {
        return
      }
    }

    // 增强的播放控制 - 即使没有currentSong也能控制全局音频
    try {
      if (audio.paused || audio.ended) {
        // 如果音频已暂停或结束，尝试播放
        if (audio.src) {
          await audio.play()
          setIsPlaying(true)
        } else if (currentSong) {
          // 如果没有音频源但有当前歌曲，加载并播放
          audio.src = currentSong.url
          audio.load()
          await audio.play()
          setIsPlaying(true)
        } else if (playlist.length > 0) {
          // 如果有播放列表但没有当前歌曲，使用播放列表第一首
          const firstSong = playlist[0]
          audio.src = firstSong.url
          audio.load()
          setCurrentSongIndex(0)
          await audio.play()
          setIsPlaying(true)
        }
      } else {
        // 如果正在播放，暂停
        audio.pause()
        setIsPlaying(false)
      }
    } catch {
      // Browser autoplay and unavailable audio sources are expected failure cases.
    }
  }

  const previousSong = async () => {
    if (playlist.length === 0) {
      // 如果当前播放列表为空，尝试从歌单队列中选择歌曲（从队列前部，即较早的歌曲）
      if (songQueue.length > 0) {
        // 上一首选择队列前部的歌曲
        const selectedSong = songQueue[0]
        setPlaylist([selectedSong])
        setCurrentSongIndex(0)
        setIsPlaying(false)
        setCurrentTime(0)
        setDuration(0)

        setTimeout(async () => {
          const audio = audioRef.current
          if (audio) {
            if (audio.src !== selectedSong.url) audio.src = selectedSong.url
            try {
              await audio.play()
              setIsPlaying(true)
            } catch {
              // Autoplay can be blocked by the browser; leave the song paused.
            }
          }
        }, 100)
      }
      return
    }

    const prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length
    const prevSong = playlist[prevIndex]

    setCurrentSongIndex(prevIndex)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    // 切歌后自动播放。next/prev 仍用短 delay（已知债）；必须先设 src。
    setTimeout(async () => {
      const audio = audioRef.current
      if (audio && prevSong) {
        if (audio.src !== prevSong.url) audio.src = prevSong.url
        try {
          await audio.play()
          setIsPlaying(true)
        } catch {
          // Autoplay can be blocked by the browser; leave the song paused.
        }
      }
    }, 100)
  }

  const nextSong = async () => {
    if (playlist.length === 0) {
      // 如果当前播放列表为空，尝试从歌单队列中选择歌曲（从队列末尾，即最新的歌曲）
      if (songQueue.length > 0) {
        // 优先从后进入的往前播放，所以从队列末尾开始选择
        const selectedSong = songQueue[songQueue.length - 1]
        setPlaylist([selectedSong])
        setCurrentSongIndex(0)
        setIsPlaying(false)
        setCurrentTime(0)
        setDuration(0)

        setTimeout(async () => {
          const audio = audioRef.current
          if (audio) {
            if (audio.src !== selectedSong.url) audio.src = selectedSong.url
            try {
              await audio.play()
              setIsPlaying(true)
            } catch {
              // Autoplay can be blocked by the browser; leave the song paused.
            }
          }
        }, 100)
      }
      return
    }

    let nextIndex = (currentSongIndex + 1) % playlist.length

    // 如果当前播放列表播放完了一轮，从歌单队列中选择歌曲（优先最新的）
    if (nextIndex === 0 && songQueue.length > 0) {
      const currentPlaylist = playlist.map((song) => `${song.title}-${song.artist}`)
      const queueSongs = songQueue.filter(
        (song) => !currentPlaylist.includes(`${song.title}-${song.artist}`)
      )

      if (queueSongs.length > 0) {
        // 队列模式：优先从后进入的往前播放，所以选择队列末尾的歌曲
        const selectedSong = queueSongs[queueSongs.length - 1]

        // 将选中的歌曲添加到当前播放列表
        setPlaylist((prev) => [...prev, selectedSong])
        nextIndex = playlist.length // 设置为新添加的歌曲索引
      }
    }

    setCurrentSongIndex(nextIndex)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    const nextTrack = playlist[nextIndex] ?? songQueue[songQueue.length - 1]
    setTimeout(async () => {
      const audio = audioRef.current
      if (audio && nextTrack) {
        if (audio.src !== nextTrack.url) audio.src = nextTrack.url
        try {
          await audio.play()
          setIsPlaying(true)
        } catch {
          // Autoplay can be blocked by the browser; leave the song paused.
        }
      }
    }, 100)
  }

  nextSongRef.current = nextSong

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (!hasAnyPlayableSource(cards) && !playingSong && playlist.length === 0) return null

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform">
      {/* 音乐信息显示 - 改进显示逻辑，支持全局音频状态 */}
      {(currentSong || (audioRef.current && audioRef.current.src)) &&
        (isPlaying || currentTime > 0 || (audioRef.current && !audioRef.current.paused)) && (
          <div className="mb-1 flex w-full justify-center">
            <div className="flex h-12 max-w-[280px] min-w-[140px] scale-75 flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/80 px-3 py-2 text-xs text-gray-600 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-300">
              <div className="w-full truncate text-center font-medium">
                {currentSong ? `${currentSong.title} - ${currentSong.artist}` : '正在播放音乐...'}
              </div>
              <div className="text-xs opacity-75">
                {formatTime(currentTime)} / {formatTime(duration)}
              </div>
            </div>
          </div>
        )}

      <div className="flex w-full justify-center">
        <TooltipProvider>
          <Dock
            direction="middle"
            className="scale-75 border border-gray-200/50 bg-white/80 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/80"
          >
            {/* Previous Song */}
            <DockIcon>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    onClick={previousSong}
                    role="button"
                    tabIndex={0}
                    aria-label="上一曲"
                    className={cn(
                      'flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        previousSong()
                      }
                    }}
                  >
                    <SkipBack className="size-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>上一曲</p>
                </TooltipContent>
              </Tooltip>
            </DockIcon>

            <Separator orientation="vertical" className="mx-1 h-8 opacity-50" />

            {/* Play/Pause */}
            <DockIcon>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    onClick={togglePlay}
                    role="button"
                    tabIndex={0}
                    aria-label={isPlaying ? '暂停音乐' : '播放音乐'}
                    className={cn(
                      'flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        togglePlay()
                      }
                    }}
                  >
                    {isPlaying ? <Pause className="size-3" /> : <Play className="size-3" />}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isPlaying ? '暂停' : '播放'}</p>
                </TooltipContent>
              </Tooltip>
            </DockIcon>

            <Separator orientation="vertical" className="mx-1 h-8 opacity-50" />

            {/* Next Song */}
            <DockIcon>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    onClick={nextSong}
                    role="button"
                    tabIndex={0}
                    aria-label="下一曲"
                    className={cn(
                      'flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        nextSong()
                      }
                    }}
                  >
                    <SkipForward className="size-3" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>下一曲</p>
                </TooltipContent>
              </Tooltip>
            </DockIcon>
          </Dock>
        </TooltipProvider>
      </div>

      {/* 全局音频实例已在useEffect中处理，这里不需要渲染audio元素 */}
    </div>
  )
}

export default MusicDock
