'use client'

import { useState, useRef, useEffect } from 'react'
import { Dock, DockIcon } from '@/components/magicui/dock'
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-react'
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

type PersistedPlayerState = {
  currentSongIndex?: number
  currentTime?: number
  playlist?: Song[]
  isPlaying?: boolean
  currentSong?: Song
  audioSrc?: string
}

const musicApiUrl = process.env.NEXT_PUBLIC_MUSIC_API_URL
const PLAYER_STATE_KEY = 'musicPlayerState'

function readPersistedPlayerState(): PersistedPlayerState | null {
  try {
    const raw = localStorage.getItem(PLAYER_STATE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as PersistedPlayerState
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    // Ignore malformed persisted state and use the default player state.
    return null
  }
}

const MusicDock = () => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [playlist, setPlaylist] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  // 首次加载恢复播放列表时，等 metadata 就绪后再跳到上次的进度
  const pendingSeekRef = useRef<number | null>(null)
  // 连续播放失败计数：一轮播放列表全部失败时停止切歌，避免 error→next 无限循环
  const errorCountRef = useRef(0)
  const { cards, songQueue, addToSongQueue } = useSongContext()
  const currentSong = playlist[currentSongIndex]

  // 事件监听器只在挂载时绑定一次，通过这些 ref 读取最新实现，不在渲染期赋值
  const savePlayerStateRef = useRef<() => void>(() => {})
  const fetchPlaylistRef = useRef<() => Promise<void>>(async () => {})
  const nextSongRef = useRef<() => void>(() => {})
  const playlistLengthRef = useRef(0)

  const savePlayerState = () => {
    if (typeof window === 'undefined') return

    try {
      const audio = audioRef.current
      const state = {
        currentSongIndex,
        currentTime: audio?.currentTime || currentTime,
        playlist: playlist.slice(0, 10), // 保存前10首，避免存储过多
        isPlaying: audio ? !audio.paused && !audio.ended : isPlaying,
        currentSong: currentSong ?? undefined, // 保存当前歌曲的完整信息
        audioSrc: audio?.src || '', // 保存音频源URL以便对比
      }
      localStorage.setItem(PLAYER_STATE_KEY, JSON.stringify(state))
    } catch {
      // Ignore storage failures; they should not interrupt playback.
    }
  }

  const fetchSongInfo = async (songName: string): Promise<Song | null> => {
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
        id: `${songName}-${Date.now()}`,
        title: data.data.song_name,
        artist: data.data.song_singer,
        url: data.data.music_url,
        cover: data.data.cover,
      }
    } catch {
      return null
    }
  }

  const fetchPlaylist = async () => {
    try {
      setLoading(true)
      setLoadError(false)
      const cardNames = cards.map((card) => card.song)

      // 如果没有cards，直接返回，不做任何处理
      if (cardNames.length === 0) return

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

        return isEasonChan
      })

      if (validSongs.length === 0) {
        // 全部查询失败或被过滤时给出可见反馈，而不是静默隐藏功能
        setLoadError(true)
        return
      }

      // 将cards歌曲添加到队列
      const currentPlayingSong = playlist[currentSongIndex]
      addToSongQueue(validSongs, currentPlayingSong)

      // 检查是否正在播放音乐
      const audio = audioRef.current
      const isCurrentlyPlaying = audio && audio.src && !audio.paused && !audio.ended

      if (!isCurrentlyPlaying && playlist.length === 0) {
        setPlaylist(validSongs)
      }
    } catch {
      // A failed optional music lookup should leave the rest of the site usable.
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const playSong = async (song: Song) => {
    const audio = audioRef.current
    if (!audio) return

    if (audio.src !== song.url) {
      audio.src = song.url
      audio.load()
    }

    try {
      await audio.play()
    } catch {
      // Autoplay can be blocked by the browser; leave the song paused.
    }
  }

  const startSong = (song: Song) => {
    setCurrentTime(0)
    setDuration(0)
    void playSong(song)
  }

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio) return

    // 播放列表为空时直接从歌单队列加载第一首，不依赖状态更新后的重试
    if (!currentSong && playlist.length === 0) {
      if (songQueue.length === 0) return

      const selectedSong = songQueue[0]
      setPlaylist([selectedSong])
      setCurrentSongIndex(0)
      await playSong(selectedSong)
      return
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
          await playSong(currentSong)
          setIsPlaying(true)
        } else if (playlist.length > 0) {
          // 如果有播放列表但没有当前歌曲，使用播放列表第一首
          const firstSong = playlist[0]
          setCurrentSongIndex(0)
          await playSong(firstSong)
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

  const previousSong = () => {
    // 如果当前播放列表为空，从歌单队列前部（较早的歌曲）选择
    if (playlist.length === 0) {
      if (songQueue.length > 0) {
        const selectedSong = songQueue[0]
        setPlaylist([selectedSong])
        setCurrentSongIndex(0)
        startSong(selectedSong)
      }
      return
    }

    const prevIndex = (currentSongIndex - 1 + playlist.length) % playlist.length

    // 切歌后自动播放
    setCurrentSongIndex(prevIndex)
    startSong(playlist[prevIndex])
  }

  const nextSong = () => {
    // 如果当前播放列表为空，从歌单队列末尾（最新的歌曲）选择
    if (playlist.length === 0) {
      if (songQueue.length > 0) {
        const selectedSong = songQueue[songQueue.length - 1]
        setPlaylist([selectedSong])
        setCurrentSongIndex(0)
        startSong(selectedSong)
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
        setCurrentSongIndex(nextIndex)
        startSong(selectedSong)
        return
      }
    }

    // 无论之前是否在播放，切歌后都自动播放
    setCurrentSongIndex(nextIndex)
    startSong(playlist[nextIndex])
  }

  // 每次渲染后同步最新实现到 ref，供挂载时绑定的事件监听器调用
  useEffect(() => {
    savePlayerStateRef.current = savePlayerState
    fetchPlaylistRef.current = fetchPlaylist
    nextSongRef.current = nextSong
    playlistLengthRef.current = playlist.length
  })

  // 使用全局音频实例避免页面切换时中断；挂载时绑定一次事件并恢复上次状态
  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!window.globalAudioPlayer) {
      window.globalAudioPlayer = new Audio()
      window.globalAudioPlayer.preload = 'metadata'
      window.globalAudioPlayer.setAttribute('playsinline', 'true')
      window.globalAudioPlayer.crossOrigin = 'anonymous'
    }

    const audio = window.globalAudioPlayer
    audioRef.current = audio

    const handlePlay = () => {
      errorCountRef.current = 0
      setIsPlaying(true)
    }
    const handlePause = () => setIsPlaying(false)
    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleLoadedData = () => {
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration)
      }

      if (pendingSeekRef.current !== null) {
        try {
          audio.currentTime = pendingSeekRef.current
        } catch {
          // Seeking before metadata is ready can fail; the next event will retry.
        }
        pendingSeekRef.current = null
      }
    }
    const handleEnded = () => {
      setIsPlaying(false)
      nextSongRef.current()
    }
    const handleError = () => {
      errorCountRef.current += 1
      if (errorCountRef.current >= Math.max(playlistLengthRef.current, 1)) {
        // 一轮播放列表全部失败时停止切歌并提示重试
        setLoadError(true)
        return
      }
      nextSongRef.current()
    }

    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('loadedmetadata', handleLoadedData)
    audio.addEventListener('durationchange', handleLoadedData)
    audio.addEventListener('error', handleError)

    // 立即同步全局音频状态到本地状态（跨页面导航时全局实例可能仍在播放）
    setIsPlaying(!audio.paused && !audio.ended)
    setCurrentTime(audio.currentTime || 0)
    if (!isNaN(audio.duration)) {
      setDuration(audio.duration || 0)
    }

    // 恢复上次保存的歌曲信息：优先匹配仍在播放的音频源
    const saved = readPersistedPlayerState()
    if (saved) {
      if (saved.currentSong && saved.audioSrc === audio.src) {
        if (saved.playlist && saved.playlist.length > 1) {
          setPlaylist(saved.playlist)
          setCurrentSongIndex(Math.min(saved.currentSongIndex || 0, saved.playlist.length - 1))
        } else {
          setPlaylist([saved.currentSong])
          setCurrentSongIndex(0)
        }

        if (saved.currentTime && Math.abs(audio.currentTime - saved.currentTime) > 5) {
          try {
            audio.currentTime = saved.currentTime
          } catch {
            // Ignore seek failures; playback position is best-effort.
          }
        }
      } else if (saved.playlist && saved.playlist.length > 0) {
        const savedIndex = Math.min(saved.currentSongIndex || 0, saved.playlist.length - 1)
        const savedSong = saved.playlist[savedIndex]

        if (!audio.src) {
          // 首次加载：恢复播放列表和进度，但不自动播放
          setPlaylist(saved.playlist)
          setCurrentSongIndex(savedIndex)
          if (saved.currentTime && saved.currentTime > 0) {
            pendingSeekRef.current = saved.currentTime
          }
        } else if (savedSong && savedSong.url === audio.src) {
          setPlaylist(saved.playlist)
          setCurrentSongIndex(savedIndex)
        }
      }
    }

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
  }, [])

  // 定期保存播放状态
  useEffect(() => {
    const interval = setInterval(() => {
      if (playlistLengthRef.current > 0) {
        savePlayerStateRef.current()
      }
    }, 10000) // 每10秒保存一次

    return () => clearInterval(interval)
  }, [])

  // 页面卸载前保存状态
  useEffect(() => {
    const handleBeforeUnload = () => {
      savePlayerStateRef.current()
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // 每次cards变化时都获取新歌曲并添加到队列
  useEffect(() => {
    if (cards.length > 0 && musicApiUrl) {
      void fetchPlaylistRef.current()
    } else {
      setLoading(false)
    }
  }, [cards])

  // 当歌曲变化时，更新全局音频实例的src
  useEffect(() => {
    const audio = audioRef.current
    if (!currentSong || !audio) return

    if (audio.src !== currentSong.url) {
      audio.src = currentSong.url
      audio.load() // 重新加载音频
    }
  }, [currentSong])

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
      {/* 音乐信息显示：状态由音频事件驱动，不在 JSX 中读取 audioRef */}
      {currentSong && (isPlaying || currentTime > 0) && (
        <div className="mb-1 flex w-full justify-center">
          <div className="flex h-12 max-w-[280px] min-w-[140px] scale-75 flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/80 px-3 py-2 text-xs text-gray-600 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-300">
            <div className="w-full truncate text-center font-medium">
              {`${currentSong.title} - ${currentSong.artist}`}
            </div>
            <div className="text-xs opacity-75">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
        </div>
      )}

      {/* 歌曲查询全部失败或被过滤时提供重试入口 */}
      {loadError && playlist.length === 0 && (
        <div className="mb-1 flex w-full justify-center">
          <button
            type="button"
            onClick={() => void fetchPlaylistRef.current()}
            className="flex h-12 scale-75 items-center justify-center gap-2 rounded-2xl border border-gray-200/50 bg-white/80 px-4 py-2 text-xs text-gray-600 backdrop-blur-md transition-colors hover:bg-gray-100 dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <RotateCcw className="size-3" />
            音乐加载失败，点击重试
          </button>
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
                        void togglePlay()
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
