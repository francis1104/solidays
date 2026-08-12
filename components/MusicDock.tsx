'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Dock, DockIcon } from '@/components/magicui/dock'
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/components/lib/utils'
import { useSongContext } from '@/contexts/SongContext'

// 扩展Window类型
declare global {
  interface Window {
    globalAudioPlayer?: HTMLAudioElement
  }
}

interface Song {
  id: string
  title: string
  artist: string
  url: string
  cover?: string
}

interface MusicApiResponse {
  code: number
  data?: {
    song_name: string
    song_singer: string
    music_url: string
    cover?: string
  } | null
}

const musicApiUrl = process.env.NEXT_PUBLIC_MUSIC_API_URL

const MusicDock = () => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [playlist, setPlaylist] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { cards, songQueue, addToSongQueue } = useSongContext()

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
      } catch (error) {
        console.error('加载播放状态失败:', error)
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
      } catch (error) {
        console.error('保存播放状态失败:', error)
      }
    }
  }

  // 定期保存播放状态
  useEffect(() => {
    const interval = setInterval(() => {
      if (playlist.length > 0) {
        savePlayerState()
      }
    }, 10000) // 每10秒保存一次

    return () => clearInterval(interval)
  }, [currentSongIndex, currentTime, playlist])

  // 页面卸载前保存状态
  useEffect(() => {
    const handleBeforeUnload = () => {
      savePlayerState()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentSongIndex, currentTime, playlist])

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

        // 如果全局音频有内容但本地状态为空，尝试恢复
        if (audio.src && (!currentSong || playlist.length === 0)) {
          setTimeout(() => {
            try {
              const savedState = localStorage.getItem('musicPlayerState')
              if (savedState) {
                const parsedState = JSON.parse(savedState)

                // 优先使用保存的currentSong信息进行快速恢复
                if (parsedState.currentSong && parsedState.audioSrc === audio.src) {
                  console.log('快速恢复歌曲信息:', parsedState.currentSong.title)
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
                    console.log('恢复播放状态:', savedCurrentSong.title)
                  }
                }
              }
            } catch (error) {
              console.error('恢复播放状态失败:', error)
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
        nextSong()
      }, 0)
    }
    const handleLoadedData = () => {
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    }
    const handleError = () => {
      console.log('音频加载错误')
      setTimeout(() => {
        nextSong()
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
  const getCardNames = (): string[] => {
    if (cards.length > 0) {
      return cards.map((card) => card.song)
    }

    // 如果Context中没有数据，返回空数组
    return []
  }

  // 调用API获取歌曲信息
  const fetchSongInfo = async (songName: string): Promise<Song | null> => {
    if (!musicApiUrl) return null

    try {
      const endpoint = new URL(musicApiUrl)
      endpoint.searchParams.set('msg', songName)
      endpoint.searchParams.set('type', 'json')
      endpoint.searchParams.set('n', '1')
      const response = await fetch(endpoint)

      if (!response.ok) {
        console.error(`API请求失败: ${response.status}`)
        return null
      }

      const data = (await response.json()) as MusicApiResponse

      if (data.code !== 200 || !data.data) {
        console.error(`API返回错误: ${data.code}`)
        return null
      }

      return {
        id: `${songName}-${Date.now()}`,
        title: data.data.song_name,
        artist: data.data.song_singer,
        url: data.data.music_url,
        cover: data.data.cover,
      }
    } catch (error) {
      console.error(`获取歌曲信息失败 ${songName}:`, error)
      return null
    }
  }

  // 获取播放列表
  const fetchPlaylist = async () => {
    try {
      setLoading(true)
      const cardNames = getCardNames()

      // 如果没有cards，直接返回，不做任何处理
      if (cardNames.length === 0) {
        console.log('[播放列表] 没有卡片，跳过获取歌曲')
        return
      }

      const songPromises = cardNames.map((name) => fetchSongInfo(name))
      const songResults = await Promise.all(songPromises)

      // 过滤掉null值（API错误的歌曲）和非陈奕迅的歌曲
      const validSongs = songResults.filter((song): song is Song => {
        if (song === null) return false

        // 检查是否是陈奕迅的歌曲
        const isEasonChan =
          song.artist.includes('陈奕迅') ||
          song.artist.includes('Eason') ||
          song.artist.includes('Eason Chan')

        if (!isEasonChan) {
          console.log(`过滤掉非陈奕迅歌曲: ${song.title} - ${song.artist}`)
        }

        return isEasonChan
      })

      console.log(`[卡片歌曲] 找到 ${validSongs.length} 首陈奕迅的歌曲`)

      // 将cards歌曲添加到队列
      const currentPlayingSong = playlist[currentSongIndex]
      addToSongQueue(validSongs, currentPlayingSong)

      console.log(
        `[歌单变动] 新增歌曲到队列:`,
        validSongs.map((song) => `${song.title} - ${song.artist}`)
      )

      // 显示当前完整队列
      if (songQueue.length > 0) {
        console.log(
          `[当前队列]`,
          songQueue.map((song) => `${song.title} - ${song.artist}`)
        )
      }

      // 检查是否正在播放音乐
      const audio = audioRef.current
      const isCurrentlyPlaying = audio && audio.src && !audio.paused && !audio.ended

      if (isCurrentlyPlaying) {
        // 如果正在播放，只更新队列，不更改当前播放列表
        console.log('音乐正在播放，已将新歌曲添加到队列，但保持当前播放状态')
      } else {
        // 如果没有播放或播放列表为空，且有有效歌曲，设置播放列表
        if (playlist.length === 0 && validSongs.length > 0) {
          setPlaylist(validSongs)
          console.log(
            `[播放列表初始化]`,
            validSongs.map((song) => `${song.title} - ${song.artist}`)
          )
        }
      }

      if (validSongs.length === 0) {
        console.log('过滤后没有找到陈奕迅的歌曲')
      }
    } catch (error) {
      console.error('获取播放列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 每次cards变化时都获取新歌曲并添加到队列
    if (cards.length > 0 && musicApiUrl) {
      fetchPlaylist()
    } else {
      setLoading(false)
    }
  }, [cards]) // 监听cards变化

  const currentSong = playlist[currentSongIndex]

  // 当歌曲变化时，更新全局音频实例的src
  useEffect(() => {
    if (currentSong && audioRef.current) {
      if (audioRef.current.src !== currentSong.url) {
        audioRef.current.src = currentSong.url
        audioRef.current.load() // 重新加载音频
      }
    }
  }, [currentSong])

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
          } catch (error) {
            console.error('恢复当前歌曲失败:', error)
          }
        }
      }
    }

    // 立即同步一次
    syncAudioState()

    // 每秒同步一次状态，确保UI与音频状态一致
    const interval = setInterval(syncAudioState, 1000)

    return () => clearInterval(interval)
  }, [currentSong])

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    // 如果没有播放列表或当前歌曲，尝试从队列中获取
    if (!currentSong && playlist.length === 0) {
      if (songQueue.length > 0) {
        console.log('[播放控制] 从队列中选择歌曲播放')
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
        console.log('[播放控制] 没有可播放的歌曲')
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
    } catch (error) {
      console.log('音频播放失败:', error)
    }
  }

  const previousSong = async () => {
    if (playlist.length === 0) {
      // 如果当前播放列表为空，尝试从歌单队列中选择歌曲（从队列前部，即较早的歌曲）
      if (songQueue.length > 0) {
        // 上一首选择队列前部的歌曲
        const selectedSong = songQueue[0]
        console.log(`[切换歌曲] 上一首: ${selectedSong.title} - ${selectedSong.artist}`)
        console.log(
          `[当前队列]`,
          songQueue.map((song) => `${song.title} - ${song.artist}`)
        )
        setPlaylist([selectedSong])
        setCurrentSongIndex(0)
        setIsPlaying(false)
        setCurrentTime(0)
        setDuration(0)

        setTimeout(async () => {
          const audio = audioRef.current
          if (audio) {
            try {
              await audio.play()
              setIsPlaying(true)
            } catch (error) {
              console.log('自动播放失败:', error)
            }
          }
        }, 100)
      }
      return
    }

    const prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length

    console.log(`[切换歌曲] 上一首: ${playlist[prevIndex].title} - ${playlist[prevIndex].artist}`)
    console.log(
      `[当前播放列表]`,
      playlist.map((song) => `${song.title} - ${song.artist}`)
    )

    setCurrentSongIndex(prevIndex)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

    // 切歌后自动播放
    setTimeout(async () => {
      const audio = audioRef.current
      if (audio) {
        try {
          await audio.play()
          setIsPlaying(true)
        } catch (error) {
          console.log('自动播放失败:', error)
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
        console.log(`[切换歌曲] 下一首: ${selectedSong.title} - ${selectedSong.artist}`)
        console.log(
          `[当前队列]`,
          songQueue.map((song) => `${song.title} - ${song.artist}`)
        )
        setPlaylist([selectedSong])
        setCurrentSongIndex(0)
        setIsPlaying(false)
        setCurrentTime(0)
        setDuration(0)

        setTimeout(async () => {
          const audio = audioRef.current
          if (audio) {
            try {
              await audio.play()
              setIsPlaying(true)
            } catch (error) {
              console.log('自动播放失败:', error)
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

    // 打印切换后的歌曲和播放列表信息
    const nextSongInfo = playlist[nextIndex] || playlist[0] // 防止索引越界
    if (nextSongInfo) {
      console.log(`[切换歌曲] 下一首: ${nextSongInfo.title} - ${nextSongInfo.artist}`)
      console.log(
        `[当前播放列表]`,
        playlist.map((song) => `${song.title} - ${song.artist}`)
      )
    }

    // 无论之前是否在播放，切歌后都自动播放
    setTimeout(async () => {
      const audio = audioRef.current
      if (audio) {
        try {
          await audio.play()
          setIsPlaying(true)
        } catch (error) {
          console.log('自动播放失败:', error)
        }
      }
    }, 100) // 稍微延迟确保新音频已加载
  }

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 transform">
        <div className="flex h-12 scale-75 items-center justify-center rounded-2xl border border-gray-200/50 bg-white/80 px-4 py-2 text-sm text-gray-600 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-300">
          加载音乐中...
        </div>
      </div>
    )
  }

  if (!musicApiUrl && playlist.length === 0) return null

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
