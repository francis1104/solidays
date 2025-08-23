'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Dock, DockIcon } from '@/components/magicui/dock'
import { Play, Pause, Volume2, VolumeX, SkipForward } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/components/lib/utils'

interface Song {
  id: string
  title: string
  artist: string
  url: string
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

  // 模拟API获取歌曲列表
  const fetchPlaylist = async () => {
    try {
      setLoading(true)
      // 这里应该替换为你的实际API
      const mockPlaylist: Song[] = [
        {
          id: '1',
          title: '示例歌曲1',
          artist: '艺术家1',
          url: 'https://sjy6.stream.qqmusic.qq.com/F000003BGqJ14ak5uu.flac?guid=lpz_api&vkey=972EBD5B22D77217FEA4AC5039DBC67FF683D37A8C386578B84144D4B5FD337FBF2F96A3E4F03CDECC7C821E407EAEAE42BEE886B0BD7709__v2b9ab17b&uin=1365104246&fromtag=119117',
        },
        {
          id: '2',
          title: '示例歌曲2',
          artist: '艺术家2',
          url: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav',
        },
        {
          id: '3',
          title: '示例歌曲3',
          artist: '艺术家3',
          url: 'https://sjy6.stream.qqmusic.qq.com/F000001PCmv33ZdrB4.flac?guid=lpz_api&vkey=5BC5B760AA94794625F62AF98966E1BB1142D65D55C163A445865102653476192E183A7CA9454C7E794C92AF60B4A50DF8F4962C215D3C14__v2b94c614&uin=1365104246&fromtag=119117',
        },
      ]

      // 模拟网络延迟
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setPlaylist(mockPlaylist)
    } catch (error) {
      console.error('获取播放列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlaylist()
  }, [])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)

    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)

    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
    }
  }, [])

  const currentSong = playlist[currentSongIndex]

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

  const nextSong = () => {
    if (playlist.length === 0) return

    const nextIndex = (currentSongIndex + 1) % playlist.length
    setCurrentSongIndex(nextIndex)
    setIsPlaying(false)
    setCurrentTime(0)
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
        <div className="mb-1 text-center">
          <div className="flex h-12 min-w-[140px] scale-75 flex-col items-center justify-center rounded-2xl border border-gray-200/50 bg-white/80 px-3 py-2 text-xs text-gray-600 backdrop-blur-md dark:border-gray-700/50 dark:bg-gray-900/80 dark:text-gray-300">
            <div className="max-w-full truncate font-medium">
              {currentSong.title} - {currentSong.artist}
            </div>
            <div className="text-xs opacity-75">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>
        </div>
      )}

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

      {/* 音频元素 */}
      {currentSong && (
        <audio
          ref={audioRef}
          src={currentSong.url}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={nextSong}
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
