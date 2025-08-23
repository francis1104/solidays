'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Dock, DockIcon } from '@/components/magicui/dock'
import { Play, Pause, Volume2, VolumeX, SkipForward } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/components/lib/utils'
import { useSongContext } from '@/contexts/SongContext'

interface Song {
  id: string
  title: string
  artist: string
  url: string
  cover?: string
}

const MusicDock = () => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [currentSongIndex, setCurrentSongIndex] = useState(0)
  const [playlist, setPlaylist] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement>(null)
  const { cards } = useSongContext()

  // 从Context获取歌曲名称，如果没有则使用默认歌曲列表
  const getCardNames = (): string[] => {
    if (cards.length > 0) {
      return cards.map((card) => card.song)
    }

    // 如果Context中没有数据，使用默认的陈奕迅歌曲列表
    return ['歌颂', '浮夸', '十年', '富士山下', '红玫瑰']
  }

  // 调用API获取歌曲信息
  const fetchSongInfo = async (songName: string): Promise<Song | null> => {
    try {
      const response = await fetch(
        `http://lpz.chatc.vip/apiqq.php?msg=${encodeURIComponent(songName)}&type=json&n=1`
      )

      if (!response.ok) {
        console.error(`API请求失败: ${response.status}`)
        return null
      }

      const data = await response.json()

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

      console.log(`找到 ${validSongs.length} 首陈奕迅的歌曲`)

      // 即使过滤后歌曲很少，也不添加额外的默认歌曲
      // 直接使用过滤后的结果作为播放列表
      setPlaylist(validSongs)

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
    fetchPlaylist()
  }, [cards]) // 监听cards变化

  const currentSong = playlist[currentSongIndex]

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => {
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    }
    const handleLoadedData = () => {
      if (!isNaN(audio.duration)) {
        setDuration(audio.duration)
      }
    }

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('loadeddata', handleLoadedData)
    audio.addEventListener('durationchange', updateDuration)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('loadeddata', handleLoadedData)
      audio.removeEventListener('durationchange', updateDuration)
    }
  }, [currentSong]) // 当歌曲变化时重新绑定事件

  const togglePlay = async () => {
    const audio = audioRef.current
    if (!audio || !currentSong) return

    try {
      if (isPlaying) {
        audio.pause()
      } else {
        await audio.play()
      }
      setIsPlaying(!isPlaying)
    } catch (error) {
      console.log('音频播放失败:', error)
    }
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return

    audio.muted = !isMuted
    setIsMuted(!isMuted)
  }

  const nextSong = async () => {
    if (playlist.length === 0) return

    const nextIndex = (currentSongIndex + 1) % playlist.length

    setCurrentSongIndex(nextIndex)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)

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
      <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transform">
        <div className="flex h-12 scale-75 items-center justify-center rounded-2xl border border-gray-200/50 bg-white/80 px-4 py-2 text-sm text-gray-600 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-300">
          加载音乐中...
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transform">
      {/* 音乐信息显示 */}
      {currentSong && (isPlaying || currentTime > 0) && (
        <div className="mb-1 flex w-full justify-center">
          <div className="flex h-12 max-w-[280px] min-w-[140px] scale-75 flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/80 px-3 py-2 text-xs text-gray-600 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-300">
            <div className="w-full truncate text-center font-medium">
              {currentSong.title} - {currentSong.artist}
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

            <Separator orientation="vertical" className="mx-1 h-8 opacity-50" />

            {/* Mute/Unmute */}
            <DockIcon>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    onClick={toggleMute}
                    role="button"
                    tabIndex={0}
                    aria-label={isMuted ? '取消静音' : '静音'}
                    className={cn(
                      'flex size-10 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800'
                    )}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        toggleMute()
                      }
                    }}
                  >
                    {isMuted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isMuted ? '取消静音' : '静音'}</p>
                </TooltipContent>
              </Tooltip>
            </DockIcon>
          </Dock>
        </TooltipProvider>
      </div>

      {/* 音频元素 */}
      {currentSong && (
        <audio
          ref={audioRef}
          src={currentSong.url}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={nextSong}
          onLoadedData={() => {
            // 当新歌曲数据加载完成后，如果应该播放就开始播放
            const audio = audioRef.current
            if (audio && !isNaN(audio.duration)) {
              setDuration(audio.duration)
            }
          }}
          onError={(e) => {
            console.log('音频加载错误:', e)
            nextSong() // 如果当前歌曲出错，自动跳到下一曲
          }}
          crossOrigin="anonymous"
          preload="metadata"
          playsInline
        >
          <track kind="captions" />
        </audio>
      )}
    </div>
  )
}

export default MusicDock
