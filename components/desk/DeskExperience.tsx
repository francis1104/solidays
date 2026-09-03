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
import { mediaUrl, privateMediaUrl } from '@/lib/media'
import type { DeskVisualVariant } from './desk-assets'

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

function DeskPreview({ progress, onExit }: { progress: number; onExit: () => void }) {
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
        <div
          role="progressbar"
          aria-label="Loading desk"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <p className="mb-3 font-mono text-2xl tracking-normal text-white/80">{progress}%</p>
          <div className="mb-3 h-0.5 w-48 overflow-hidden bg-white/10">
            <div className="h-full bg-white/70" style={{ width: `${progress}%` }} />
          </div>
          {progress >= 95 ? 'Preparing the scene' : 'Loading the desk'}
        </div>
        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto mt-4 tracking-normal underline"
        >
          Back to Solidays
        </button>
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
  const [loadProgress, setLoadProgress] = useState(0)
  const [simpleMode, setSimpleMode] = useState(false)
  const [visualVariant, setVisualVariant] = useState<DeskVisualVariant>('studio')
  const [activeClip, setActiveClip] = useState<GalleryItem | undefined>()
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoError, setVideoError] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoTime, setVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState<number | null>(null)
  const [radioTrackIndex, setRadioTrackIndex] = useState(0)
  const [radioPlaying, setRadioPlaying] = useState(false)
  const [radioTime, setRadioTime] = useState(0)
  const [radioDuration, setRadioDuration] = useState<number | null>(null)
  const [radioError, setRadioError] = useState(false)
  const [radioMuted, setRadioMuted] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const phaseRef = useRef<DeskPhase>('loading')
  const targetRef = useRef<DeskTarget | null>(null)
  const galleryBagRef = useRef<string[]>([])
  const galleryCursorRef = useRef(0)
  const lastGalleryIdRef = useRef<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoCommandRef = useRef(0)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const radioRef = useRef<HTMLAudioElement>(null)
  const radioShouldPlayRef = useRef(false)

  const handleProgress = useCallback((value: number) => {
    setLoadProgress((current) => Math.max(current, Math.min(95, Math.floor(value))))
  }, [])
  const handleSceneReady = useCallback(() => {
    setLoadProgress(100)
    setSceneReady(true)
  }, [])
  const handleSceneFailure = useCallback(() => {
    // Paper hosts disappear with Canvas; close their UI subscription as well.
    window.dispatchEvent(new Event(DESK_CHAT_CLOSE_EVENT))
    setSimpleMode(true)
    setPhase('overview')
    setTarget(null)
  }, [])

  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element
    setVideoElement((current) => (current === element ? current : element))
  }, [])

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
      // The capability probe must not retain a second WebGL context.
      context?.getExtension('WEBGL_lose_context')?.loseContext()
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
      const command = ++videoCommandRef.current
      pauseGlobalMusic()
      pauseRadio()
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          setVideoReady(true)
        }
        await video.play()
        if (command === videoCommandRef.current) setVideoError(false)
      } catch {
        if (command === videoCommandRef.current) setVideoError(true)
      }
    },
    [pauseGlobalMusic, pauseRadio]
  )

  const playVideo = useCallback(() => {
    const video = videoRef.current
    if (!video || !activeClip) return
    const source = privateMediaUrl(activeClip.video)
    if (video.getAttribute('src') !== source) {
      video.src = source
      video.load()
    }
    void playVideoElement(video)
  }, [activeClip, playVideoElement])

  const toggleVideo = useCallback(() => {
    const video = videoRef.current
    if (video && !video.paused && !video.ended) {
      videoCommandRef.current += 1
      video.pause()
    } else playVideo()
  }, [playVideo])

  const nextGalleryClip = useCallback(() => {
    const next = drawGalleryItem()
    if (!next) return

    const video = videoRef.current
    const shouldPlay = Boolean(video && !video.paused && !video.ended)
    setActiveClip(next)
    setVideoError(false)
    setVideoReady(false)
    setVideoTime(0)
    setVideoDuration(null)

    if (!video) return
    videoCommandRef.current += 1
    video.pause()
    video.src = privateMediaUrl(next.video)
    video.load()

    // play() waits for data itself; no orphaned canplay listener after rapid next/exit.
    if (shouldPlay) void playVideoElement(video)
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
    const onEnded = () => selectRadioTrack(radioTrackIndex + 1, true)
    const playWhenReady = () => {
      if (!radioShouldPlayRef.current) return
      pauseGlobalMusic()
      void audio.play().catch(() => setRadioError(true))
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('durationchange', onLoadedMetadata)
    audio.addEventListener('error', onError)
    audio.addEventListener('ended', onEnded)
    if (radioShouldPlayRef.current) {
      audio.load()
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
      audio.removeEventListener('canplay', playWhenReady)
    }
  }, [pauseGlobalMusic, radioTrackIndex, selectRadioTrack])

  const cleanupVideo = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    videoCommandRef.current += 1
    video.pause()
    // Source is owned by playVideo/nextGalleryClip, not a stale JSX src prop.
    video.removeAttribute('src')
    video.load()
    setVideoPlaying(false)
    setVideoReady(false)
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
        if (nextTarget === 'computer') playVideo()
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
      if (currentTarget === 'note')
        window.dispatchEvent(new CustomEvent(DESK_CHAT_OPEN_EVENT, { detail: { embedded: true } }))
    } else if (currentPhase === 'leaving') {
      setPhase('overview')
      setTarget(null)
    }
  }, [])

  const selectVisualVariant = useCallback(
    (nextVariant: DeskVisualVariant) => {
      if (phaseRef.current !== 'overview' || nextVariant === visualVariant) return
      setSceneReady(false)
      setLoadProgress(0)
      setVisualVariant(nextVariant)
    },
    [visualVariant]
  )

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
    const pauseHiddenVideo = () => {
      if (!document.hidden) return
      videoCommandRef.current += 1
      videoRef.current?.pause()
    }
    document.addEventListener('visibilitychange', pauseHiddenVideo)
    return () => document.removeEventListener('visibilitychange', pauseHiddenVideo)
  }, [])

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
  const posterKey =
    activeClip?.posterSrcSet?.find((source) => source.width === 768)?.src ?? activeClip?.poster
  const currentPosterSource = posterKey ? privateMediaUrl(posterKey) : undefined
  const isFocused = phase === 'focused'
  const isMoving = phase === 'entering' || phase === 'leaving'
  const radioControls = {
    song: activeRadio?.song ?? 'Desk Radio',
    time: `${formatDeskTime(radioTime)} / ${formatDeskTime(radioDuration)}`,
    playing: radioPlaying,
    muted: radioMuted,
    error: radioError,
    onToggle: toggleRadio,
    onPrevious: previousRadioTrack,
    onNext: nextRadioTrack,
    onMute: () => setRadioMuted((current) => !current),
  }

  return (
    <div
      data-desk-mode
      data-desk-phase={phase}
      data-desk-target={target ?? 'overview'}
      data-desk-variant={visualVariant}
      className="fixed inset-0 z-10 overflow-hidden bg-[#080b10] text-white"
    >
      {!simpleMode && currentPosterSource ? (
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${sceneReady ? 'opacity-100' : 'opacity-0'}`}
          style={{ pointerEvents: phase === 'overview' || isFocused ? 'auto' : 'none' }}
        >
          <DeskCanvas
            visualVariant={visualVariant}
            posterUrl={currentPosterSource}
            phase={phase}
            target={target}
            reducedMotion={reducedMotion}
            videoElement={videoElement}
            videoReady={videoReady}
            videoPlaying={videoPlaying}
            radioControls={radioControls}
            onSelect={focusObject}
            onSettled={handleCameraSettled}
            onReady={handleSceneReady}
            onProgress={handleProgress}
            onContextLost={handleSceneFailure}
          />
        </div>
      ) : null}

      {!sceneReady && !simpleMode ? (
        <DeskPreview progress={loadProgress} onExit={leaveDesk} />
      ) : null}

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
        muted={radioMuted}
        src={activeRadio?.audioKey ? mediaUrl(activeRadio.audioKey) : undefined}
        preload="none"
        className="hidden"
        aria-hidden="true"
      />

      {/* The video is rendered as a Three.js texture on the computer screen. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={setVideoRef}
        preload="none"
        playsInline
        controls={simpleMode && target === 'computer'}
        tabIndex={-1}
        onPlay={() => {
          pauseGlobalMusic()
          pauseRadio()
          setVideoPlaying(true)
          setVideoError(false)
        }}
        onPause={() => setVideoPlaying(false)}
        onTimeUpdate={(event) => setVideoTime(event.currentTarget.currentTime)}
        onLoadStart={() => setVideoReady(false)}
        onLoadedData={() => setVideoReady(true)}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration
          setVideoDuration(Number.isFinite(duration) ? duration : null)
        }}
        onDurationChange={(event) => {
          const duration = event.currentTarget.duration
          setVideoDuration(Number.isFinite(duration) ? duration : null)
        }}
        onError={(event) => {
          if (!event.currentTarget.getAttribute('src')) return
          setVideoReady(false)
          setVideoError(true)
        }}
        className={
          simpleMode && target === 'computer'
            ? 'absolute top-[18%] left-1/2 z-30 max-h-[55vh] w-[min(90vw,800px)] -translate-x-1/2 bg-black'
            : 'pointer-events-none fixed -left-[9999px] h-px w-px opacity-0'
        }
        aria-hidden={!simpleMode || target !== 'computer'}
      />

      <div
        inert={!sceneReady && !simpleMode}
        aria-hidden={!sceneReady && !simpleMode}
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

        <div className="pointer-events-auto absolute top-5 right-5 text-right sm:top-8 sm:right-8">
          <p className="text-[0.6rem] tracking-[0.35em] text-white/45 uppercase">The Desk</p>
          <p className="mt-1 text-xs text-white/70">
            {isMoving ? 'Moving camera' : target ? DESK_TARGET_LABELS[target] : 'Overview'}
          </p>
          {phase === 'overview' ? (
            <div className="mt-3 ml-auto flex w-fit rounded-full border border-white/10 bg-black/25 p-1 backdrop-blur-md">
              {(['studio', 'neon'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => selectVisualVariant(option)}
                  aria-pressed={visualVariant === option}
                  className={`rounded-full px-2.5 py-1 text-[0.55rem] tracking-[0.14em] uppercase transition-colors ${
                    visualVariant === option
                      ? 'bg-white/15 text-white'
                      : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  {option === 'studio' ? 'Studio' : 'Neon'}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {isFocused && target === 'computer' ? (
          <div className="pointer-events-auto absolute right-0 bottom-[4.75rem] left-0 flex justify-center px-4 sm:bottom-20">
            <div className="desk-glass-panel flex max-w-full items-center gap-2 rounded-full px-2 py-1.5">
              <div className="max-w-[9rem] min-w-0 px-2 sm:max-w-[13rem]">
                <p className="truncate text-xs font-medium">
                  {activeClip?.game ?? activeClip?.title}
                </p>
                <p className="mt-0.5 truncate text-[0.6rem] tracking-[0.12em] text-white/50 uppercase">
                  {formatDeskTime(videoTime)} / {formatDeskTime(videoDuration)}
                  {videoError ? ' · unavailable' : ''}
                </p>
              </div>
              <DeskButton label={videoPlaying ? 'Pause video' : 'Play video'} onClick={toggleVideo}>
                {videoPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </DeskButton>
              <DeskButton label="Random next video" onClick={nextGalleryClip}>
                <Shuffle className="size-4" />
              </DeskButton>
            </div>
          </div>
        ) : null}

        {simpleMode && isFocused && target === 'radio' ? (
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

        {simpleMode && isFocused && target === 'note' ? (
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
