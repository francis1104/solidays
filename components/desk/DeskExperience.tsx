'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pause,
  Play,
  Shuffle,
  X,
} from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { useSongContext } from '@/contexts/SongContext'
import { defaultCards } from '@/data/cards'
import { galleryItems, type GalleryItem } from '@/data/gallery'
import { fndsItems } from '@/data/fnds'
import {
  createDeskShuffleBag,
  DESK_TARGET_LABELS,
  type DeskPhase,
  type DeskTarget,
} from '@/lib/desk'
import { galleryUrl } from '@/lib/gallery'
import { mediaUrl } from '@/lib/media'

const DeskCanvas = dynamic(() => import('./desk-canvas'), {
  ssr: false,
  loading: () => null,
})

const DESK_CHAT_OPEN_EVENT = 'solidays:desk-chat-open'
const DESK_CHAT_CLOSE_EVENT = 'solidays:desk-chat-close'
const DESK_CHAT_CLOSED_EVENT = 'solidays:desk-chat-closed'

function formatDeskTime(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '--:--'
  const seconds = Math.max(0, Math.floor(value))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function DeskPreview() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#080b10] text-white transition-opacity duration-500">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(67,91,126,0.3),transparent_42%),linear-gradient(135deg,#080b10_0%,#111923_52%,#080b10_100%)]" />
      <div className="relative w-[min(78vw,720px)]">
        <div className="absolute -inset-4 rounded-[2rem] border border-white/10 bg-white/[0.02] shadow-[0_0_100px_rgba(96,138,202,0.12)]" />
        <div className="relative aspect-[16/9] rounded-xl border border-white/15 bg-[#11161e] p-[5%] shadow-2xl">
          <div className="h-full rounded-lg border border-white/10 bg-[linear-gradient(135deg,#1e3148,#121a25_50%,#0b1017)] p-4">
            <div className="h-2 w-20 rounded-full bg-[#f03e91]/80" />
            <div className="mt-[18%] h-3 w-2/3 rounded-full bg-white/15" />
            <div className="mt-3 h-3 w-1/2 rounded-full bg-white/10" />
          </div>
        </div>
        <div className="mx-auto h-8 w-1/5 bg-[#171c25]" />
        <div className="mx-auto h-2 w-2/5 rounded-full bg-white/15" />
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-center text-[0.65rem] tracking-[0.35em] text-white/45 uppercase">
        Preparing the desk
      </div>
    </div>
  )
}

function DeskButton({
  children,
  label,
  onClick,
  disabled = false,
  active = false,
  className = '',
}: {
  children: React.ReactNode
  label?: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`desk-control-button ${active ? 'border-[#f03e91]/70 bg-[#f03e91]/15 text-white' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

function DeskFallback({
  activeTarget,
  onSelect,
  onExit,
}: {
  activeTarget: DeskTarget | null
  onSelect: (target: DeskTarget) => void
  onExit: () => void
}) {
  return (
    <div className="absolute inset-0 overflow-auto bg-[#080b10] px-5 py-8 text-white sm:px-10">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
        <p className="text-[0.65rem] tracking-[0.35em] text-white/50 uppercase">
          Solidays · The Desk
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">
          A quiet place for fragments.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">
          This browser is using the accessible 2D desk view. The same four objects remain available
          without WebGL.
        </p>
        <div className="mt-10 grid gap-3 sm:grid-cols-4">
          {(Object.keys(DESK_TARGET_LABELS) as DeskTarget[]).map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onSelect(target)}
              className={`rounded-2xl border p-4 text-left transition-colors ${activeTarget === target ? 'border-[#f03e91] bg-[#f03e91]/15' : 'border-white/10 bg-white/[0.04] hover:border-white/30'}`}
            >
              <span className="text-[0.65rem] tracking-[0.25em] text-white/45 uppercase">
                Object
              </span>
              <span className="mt-6 block text-lg">{DESK_TARGET_LABELS[target]}</span>
            </button>
          ))}
        </div>
        <div className="mt-8 flex gap-3">
          <button type="button" onClick={onExit} className="desk-solid-button">
            <ArrowLeft className="size-4" />
            {activeTarget ? 'Back to overview' : 'Back to Solidays'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DeskExperience() {
  const router = useRouter()
  const reducedMotion = useReducedMotion() ?? false
  const { pause: pauseGlobalMusic } = useSongContext()
  const [phase, setPhase] = useState<DeskPhase>('loading')
  const [target, setTarget] = useState<DeskTarget | null>(null)
  const [sceneReady, setSceneReady] = useState(false)
  const [simpleMode, setSimpleMode] = useState(false)
  const [activeClip, setActiveClip] = useState<GalleryItem | undefined>()
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoTime, setVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [radioTrackIndex, setRadioTrackIndex] = useState(0)
  const [radioPlaying, setRadioPlaying] = useState(false)
  const [radioTime, setRadioTime] = useState(0)
  const [radioDuration, setRadioDuration] = useState<number | null>(null)
  const [radioError, setRadioError] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const phaseRef = useRef<DeskPhase>('loading')
  const targetRef = useRef<DeskTarget | null>(null)
  const galleryBagRef = useRef<string[]>([])
  const galleryCursorRef = useRef(0)
  const lastGalleryIdRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const radioRef = useRef<HTMLAudioElement>(null)
  const radioShouldPlayRef = useRef(false)

  phaseRef.current = phase
  targetRef.current = target

  const galleryIds = useMemo(() => galleryItems.map((item) => item.id), [])

  const drawGalleryItem = useCallback(() => {
    if (galleryIds.length === 0) return undefined

    if (galleryCursorRef.current >= galleryBagRef.current.length) {
      galleryBagRef.current = createDeskShuffleBag(galleryIds, lastGalleryIdRef.current)
      galleryCursorRef.current = 0
    }

    const id = galleryBagRef.current[galleryCursorRef.current]
    galleryCursorRef.current += 1
    lastGalleryIdRef.current = id
    return galleryItems.find((item) => item.id === id)
  }, [galleryIds])

  useEffect(() => {
    setActiveClip(drawGalleryItem())
  }, [drawGalleryItem])

  useEffect(() => {
    if (!sceneReady) return
    setPhase((current) => (current === 'loading' ? 'overview' : current))
  }, [sceneReady])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('webgl2') || canvas.getContext('webgl')
      if (!context) {
        setSimpleMode(true)
        setPhase('overview')
      }
    } catch {
      setSimpleMode(true)
      setPhase('overview')
    }
  }, [])

  const pauseRadio = useCallback(() => {
    radioShouldPlayRef.current = false
    radioRef.current?.pause()
    setRadioPlaying(false)
  }, [])

  const playVideoElement = useCallback(
    async (video: HTMLVideoElement) => {
      pauseGlobalMusic()
      pauseRadio()
      try {
        await video.play()
        setVideoError(false)
      } catch {
        setVideoError(true)
      }
    },
    [pauseGlobalMusic, pauseRadio]
  )

  const playVideo = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    void playVideoElement(video)
  }, [playVideoElement])

  const nextGalleryClip = useCallback(() => {
    const next = drawGalleryItem()
    if (!next) return

    const video = videoRef.current
    const shouldPlay = Boolean(video && !video.paused && !video.ended)
    setActiveClip(next)
    setVideoError(false)
    setVideoTime(0)
    setVideoDuration(null)

    if (!video) return
    video.pause()
    video.src = galleryUrl(next.video)
    video.poster = galleryUrl(next.poster)
    video.load()

    if (shouldPlay) {
      const resume = () => {
        video.removeEventListener('canplay', resume)
        void playVideoElement(video)
      }
      if (video.readyState >= 3) {
        void playVideoElement(video)
      } else {
        video.addEventListener('canplay', resume, { once: true })
      }
    }
  }, [drawGalleryItem, playVideoElement])

  const selectRadioTrack = useCallback((nextIndex: number, shouldPlay: boolean) => {
    const next = (nextIndex + defaultCards.length) % defaultCards.length
    radioShouldPlayRef.current = shouldPlay
    setRadioTrackIndex(next)
    setRadioTime(0)
    setRadioDuration(null)
    setRadioError(false)
  }, [])

  const nextRadioTrack = useCallback(() => {
    selectRadioTrack(radioTrackIndex + 1, radioPlaying)
  }, [radioPlaying, radioTrackIndex, selectRadioTrack])

  const previousRadioTrack = useCallback(() => {
    selectRadioTrack(radioTrackIndex - 1, radioPlaying)
  }, [radioPlaying, radioTrackIndex, selectRadioTrack])

  const toggleRadio = useCallback(() => {
    const audio = radioRef.current
    if (!audio) return

    if (audio.paused || audio.ended) {
      radioShouldPlayRef.current = true
      pauseGlobalMusic()
      void audio.play().catch(() => setRadioError(true))
    } else {
      radioShouldPlayRef.current = false
      audio.pause()
    }
  }, [pauseGlobalMusic])

  useEffect(() => {
    const audio = radioRef.current
    if (!audio) return

    const onPlay = () => {
      pauseGlobalMusic()
      setRadioPlaying(true)
      setRadioError(false)
    }
    const onPause = () => setRadioPlaying(false)
    const onTimeUpdate = () =>
      setRadioTime(Number.isFinite(audio.currentTime) ? audio.currentTime : 0)
    const onLoadedMetadata = () => {
      setRadioDuration(Number.isFinite(audio.duration) ? audio.duration : null)
    }
    const onError = () => {
      setRadioPlaying(false)
      setRadioError(true)
    }
    const onEnded = () => nextRadioTrack()

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('durationchange', onLoadedMetadata)
    audio.addEventListener('error', onError)
    audio.addEventListener('ended', onEnded)
    audio.load()

    if (radioShouldPlayRef.current) {
      const playWhenReady = () => {
        audio.removeEventListener('canplay', playWhenReady)
        pauseGlobalMusic()
        void audio.play().catch(() => setRadioError(true))
      }
      if (audio.readyState >= 3) {
        void audio.play().catch(() => setRadioError(true))
      } else {
        audio.addEventListener('canplay', playWhenReady, { once: true })
      }
    }

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('durationchange', onLoadedMetadata)
      audio.removeEventListener('error', onError)
      audio.removeEventListener('ended', onEnded)
    }
  }, [nextRadioTrack, pauseGlobalMusic, radioTrackIndex])

  const cleanupVideo = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.removeAttribute('src')
    video.removeAttribute('poster')
    video.load()
    setVideoPlaying(false)
    setVideoTime(0)
    setVideoDuration(null)
  }, [])

  useEffect(() => {
    if (phase === 'leaving' || target !== 'computer') cleanupVideo()
  }, [cleanupVideo, phase, target])

  const focusObject = useCallback(
    (nextTarget: DeskTarget) => {
      if (phaseRef.current !== 'overview') return

      if (simpleMode) {
        setTarget(nextTarget)
        setPhase('focused')
        if (nextTarget === 'note') window.dispatchEvent(new Event(DESK_CHAT_OPEN_EVENT))
        return
      }

      if (nextTarget === 'computer' && !activeClip) {
        setActiveClip(drawGalleryItem())
      }

      setTarget(nextTarget)
      setPhase('entering')

      if (nextTarget === 'computer') playVideo()
    },
    [activeClip, drawGalleryItem, playVideo, simpleMode]
  )

  const exitFocus = useCallback(
    (closeChat = true) => {
      if (phaseRef.current !== 'focused') return

      if (closeChat && targetRef.current === 'note') {
        window.dispatchEvent(new Event(DESK_CHAT_CLOSE_EVENT))
      }
      if (simpleMode) {
        setTarget(null)
        setPhase('overview')
        return
      }
      setPhase('leaving')
    },
    [simpleMode]
  )

  const handleCameraSettled = useCallback(() => {
    const currentPhase = phaseRef.current
    const currentTarget = targetRef.current

    if (currentPhase === 'entering') {
      setPhase('focused')
      if (currentTarget === 'note') window.dispatchEvent(new Event(DESK_CHAT_OPEN_EVENT))
    } else if (currentPhase === 'leaving') {
      setPhase('overview')
      setTarget(null)
    }
  }, [])

  useEffect(() => {
    const handleChatClosed = () => {
      if (targetRef.current === 'note' && phaseRef.current === 'focused') exitFocus(false)
    }

    window.addEventListener(DESK_CHAT_CLOSED_EVENT, handleChatClosed)
    return () => window.removeEventListener(DESK_CHAT_CLOSED_EVENT, handleChatClosed)
  }, [exitFocus])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (phaseRef.current === 'focused') {
        if (targetRef.current === 'computer' && videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause()
          return
        }
        exitFocus()
        return
      }
      if (phaseRef.current === 'overview') router.push('/')
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [exitFocus, router])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      pauseRadio()
      cleanupVideo()
      window.dispatchEvent(new Event(DESK_CHAT_CLOSE_EVENT))
    }
  }, [cleanupVideo, pauseRadio])

  const leaveDesk = useCallback(() => {
    window.dispatchEvent(new Event(DESK_CHAT_CLOSE_EVENT))
    pauseRadio()
    cleanupVideo()
    router.push('/')
  }, [cleanupVideo, pauseRadio, router])

  const activeRadio = defaultCards[radioTrackIndex]
  const activeFrame = fndsItems[frameIndex]
  const nextFrame = fndsItems[(frameIndex + 1) % fndsItems.length]
  const currentVideoSource = activeClip ? galleryUrl(activeClip.video) : undefined
  const currentPosterSource = activeClip ? galleryUrl(activeClip.poster) : undefined
  const isFocused = phase === 'focused'
  const isMoving = phase === 'entering' || phase === 'leaving'

  return (
    <div
      data-desk-mode
      data-desk-phase={phase}
      data-desk-target={target ?? 'overview'}
      className="fixed inset-0 z-10 overflow-hidden bg-[#080b10] text-white"
    >
      {!simpleMode ? (
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${sceneReady ? 'opacity-100' : 'opacity-0'}`}
          style={{ pointerEvents: phase === 'overview' ? 'auto' : 'none' }}
        >
          <DeskCanvas
            phase={phase}
            target={target}
            reducedMotion={reducedMotion}
            onSelect={focusObject}
            onSettled={handleCameraSettled}
            onReady={() => setSceneReady(true)}
            onContextLost={() => {
              setSimpleMode(true)
              setPhase('overview')
              setTarget(null)
            }}
          />
        </div>
      ) : null}

      {!sceneReady && !simpleMode ? <DeskPreview /> : null}

      {simpleMode ? (
        <DeskFallback
          activeTarget={target}
          onSelect={focusObject}
          onExit={target ? exitFocus : leaveDesk}
        />
      ) : null}

      {/* Audio is a non-visual music control; the visible radio UI carries its label and state. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={radioRef}
        src={activeRadio?.audioKey ? mediaUrl(activeRadio.audioKey) : undefined}
        preload="metadata"
        className="hidden"
        aria-hidden="true"
      />

      <div
        className={`pointer-events-none absolute inset-0 z-20 transition-opacity duration-500 ${sceneReady || simpleMode ? 'opacity-100' : 'opacity-0'}`}
      >
        <div className="desk-back-control pointer-events-auto absolute top-5 left-5 sm:top-8 sm:left-8">
          <button
            type="button"
            onClick={leaveDesk}
            className="desk-glass-button flex items-center gap-2 text-[0.65rem] tracking-[0.22em] uppercase"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Back to Solidays</span>
            <span className="sm:hidden">Exit</span>
          </button>
        </div>

        <div className="absolute top-5 right-5 text-right sm:top-8 sm:right-8">
          <p className="text-[0.6rem] tracking-[0.35em] text-white/45 uppercase">The Desk</p>
          <p className="mt-1 text-xs text-white/70">
            {isMoving ? 'Moving camera' : target ? DESK_TARGET_LABELS[target] : 'Overview'}
          </p>
        </div>

        {isFocused && target === 'computer' ? (
          <div className="desk-computer-overlay pointer-events-auto absolute top-[13%] left-1/2 w-[min(88vw,820px)] -translate-x-1/2 sm:top-[12%]">
            <div className="overflow-hidden rounded-2xl border border-white/20 bg-black/55 shadow-[0_24px_100px_rgba(0,0,0,0.55)] backdrop-blur-md">
              <div className="relative aspect-video bg-[#111a27]">
                {/* Gameplay clips do not have a supplied caption track in the Gallery catalog. */}
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  ref={videoRef}
                  src={currentVideoSource}
                  poster={currentPosterSource}
                  preload="metadata"
                  playsInline
                  onPlay={() => {
                    pauseGlobalMusic()
                    pauseRadio()
                    setVideoPlaying(true)
                    setVideoError(false)
                  }}
                  onPause={() => setVideoPlaying(false)}
                  onTimeUpdate={(event) => setVideoTime(event.currentTarget.currentTime)}
                  onLoadedMetadata={(event) => {
                    const duration = event.currentTarget.duration
                    setVideoDuration(Number.isFinite(duration) ? duration : null)
                  }}
                  onDurationChange={(event) => {
                    const duration = event.currentTarget.duration
                    setVideoDuration(Number.isFinite(duration) ? duration : null)
                  }}
                  onError={() => setVideoError(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                  aria-label={
                    activeClip ? `${activeClip.game ?? activeClip.title} video` : 'Gallery video'
                  }
                />
                {!videoPlaying ? (
                  <button
                    type="button"
                    onClick={playVideo}
                    className="absolute inset-0 flex items-center justify-center bg-black/20"
                    aria-label="Play video"
                  >
                    <span className="flex size-14 items-center justify-center rounded-full border border-white/45 bg-black/30 backdrop-blur-sm transition-transform hover:scale-105">
                      <Play className="ml-1 size-5 fill-white" />
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {activeClip?.game ?? activeClip?.title}
                  </p>
                  <p className="mt-1 text-[0.65rem] tracking-[0.18em] text-white/50 uppercase">
                    {formatDeskTime(videoTime)} / {formatDeskTime(videoDuration)}
                    {videoError ? ' · play unavailable' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <DeskButton
                    label={videoPlaying ? 'Pause video' : 'Play video'}
                    onClick={playVideo}
                  >
                    {videoPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </DeskButton>
                  <DeskButton label="Random next video" onClick={nextGalleryClip}>
                    <Shuffle className="size-4" />
                  </DeskButton>
                  <DeskButton label="Exit computer" onClick={exitFocus}>
                    <X className="size-4" />
                  </DeskButton>
                </div>
              </div>
            </div>
            <a
              href={activeClip ? `/gallery?clip=${activeClip.id}` : '/gallery'}
              className="mt-3 inline-flex items-center gap-1 text-[0.65rem] tracking-[0.18em] text-white/45 uppercase transition-colors hover:text-white"
            >
              Open Gallery <ExternalLink className="size-3" />
            </a>
          </div>
        ) : null}

        {isFocused && target === 'radio' ? (
          <div className="pointer-events-auto absolute top-[22%] left-1/2 w-[min(86vw,420px)] -translate-x-1/2 sm:top-[20%]">
            <div className="desk-glass-panel p-5 sm:p-6">
              <p className="text-[0.65rem] tracking-[0.28em] text-[#75c7a0] uppercase">
                Desk Radio
              </p>
              <h2 className="mt-4 text-2xl tracking-tight">{activeRadio?.song}</h2>
              <p className="mt-1 text-sm text-white/50">{activeRadio?.album}</p>
              <p className="mt-5 font-mono text-xs text-white/60">
                {formatDeskTime(radioTime)} / {formatDeskTime(radioDuration)}
                {radioError ? ' · unavailable' : ''}
              </p>
              <div className="mt-5 flex items-center gap-2">
                <DeskButton label="Previous song" onClick={previousRadioTrack}>
                  <ChevronLeft className="size-4" />
                </DeskButton>
                <DeskButton
                  label={radioPlaying ? 'Pause radio' : 'Play radio'}
                  onClick={toggleRadio}
                  active
                >
                  {radioPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                </DeskButton>
                <DeskButton label="Next song" onClick={nextRadioTrack}>
                  <ChevronRight className="size-4" />
                </DeskButton>
                <DeskButton label="Exit radio" onClick={exitFocus} className="ml-auto">
                  <X className="size-4" />
                </DeskButton>
              </div>
            </div>
          </div>
        ) : null}

        {isFocused && target === 'frame' ? (
          <div className="desk-frame-overlay pointer-events-auto absolute top-[13%] left-1/2 w-[min(72vw,390px)] -translate-x-1/2 sm:top-[12%]">
            <div className="desk-glass-panel overflow-hidden p-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-white/10">
                {/* The frame intentionally uses one current image and preloads only the next image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeFrame.image}
                  alt={activeFrame.title}
                  className="h-full w-full object-cover"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={nextFrame.image}
                  alt=""
                  aria-hidden="true"
                  className="hidden"
                  loading="eager"
                />
              </div>
              <div className="flex items-center justify-between gap-3 px-2 pt-4 pb-2">
                <div>
                  <p className="text-sm font-medium">{activeFrame.title}</p>
                  <p className="mt-1 text-[0.65rem] tracking-[0.2em] text-white/45 uppercase">
                    Fear and Dreams
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <DeskButton
                    label="Previous photo"
                    onClick={() =>
                      setFrameIndex((index) => (index - 1 + fndsItems.length) % fndsItems.length)
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </DeskButton>
                  <DeskButton
                    label="Next photo"
                    onClick={() => setFrameIndex((index) => (index + 1) % fndsItems.length)}
                  >
                    <ChevronRight className="size-4" />
                  </DeskButton>
                  <DeskButton label="Exit photos" onClick={exitFocus}>
                    <X className="size-4" />
                  </DeskButton>
                </div>
              </div>
            </div>
            <a
              href="/fnds"
              className="mt-3 inline-flex items-center gap-1 text-[0.65rem] tracking-[0.18em] text-white/45 uppercase transition-colors hover:text-white"
            >
              Open FNDS <ExternalLink className="size-3" />
            </a>
          </div>
        ) : null}

        {isFocused && target === 'note' ? (
          <div className="pointer-events-none absolute top-[17%] left-1/2 -translate-x-1/2 text-center">
            <p className="text-[0.65rem] tracking-[0.3em] text-[#f4d35e]/80 uppercase">
              Leave a message
            </p>
            <p className="mt-2 text-sm text-white/55">The conversation is open beside the desk.</p>
          </div>
        ) : null}

        <div className="desk-bottom-controls pointer-events-auto absolute right-0 bottom-5 left-0 flex justify-center px-4 sm:bottom-8">
          <div className="desk-glass-panel flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5">
            {(Object.keys(DESK_TARGET_LABELS) as DeskTarget[]).map((deskTarget) => (
              <button
                key={deskTarget}
                type="button"
                onClick={() => focusObject(deskTarget)}
                disabled={phase !== 'overview'}
                className={`rounded-full px-3 py-2 text-[0.62rem] tracking-[0.12em] whitespace-nowrap uppercase transition-colors sm:px-4 ${target === deskTarget && isFocused ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-35`}
              >
                {DESK_TARGET_LABELS[deskTarget]}
              </button>
            ))}
            {isFocused ? (
              <>
                <span className="mx-1 h-4 w-px bg-white/15" />
                <button
                  type="button"
                  onClick={() => exitFocus()}
                  disabled={isMoving}
                  className="rounded-full px-3 py-2 text-[0.62rem] tracking-[0.12em] whitespace-nowrap text-white/75 uppercase transition-colors hover:bg-white/10 hover:text-white disabled:opacity-35 sm:px-4"
                >
                  Exit
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
