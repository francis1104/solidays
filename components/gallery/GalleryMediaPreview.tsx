'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { GalleryItem } from '@/data/gallery'
import { galleryUrl } from '@/lib/gallery'
import { cn } from '@/components/lib/utils'

type GalleryMediaPreviewProps = {
  item: GalleryItem
  className?: string
  imageClassName?: string
  videoClassName?: string
  children?: ReactNode
  fetchPriority?: 'high' | 'low' | 'auto'
  loading?: 'eager' | 'lazy'
}

const PREVIEW_DELAY = 200

export default function GalleryMediaPreview({
  item,
  className,
  imageClassName,
  videoClassName,
  children,
  fetchPriority,
  loading = 'lazy',
}: GalleryMediaPreviewProps) {
  const [imageReady, setImageReady] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [previewReady, setPreviewReady] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [previewRequested, setPreviewRequested] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setImageReady(false)
    setImageFailed(false)
    setPreviewReady(false)
    setPreviewFailed(false)
    setPreviewRequested(false)
    setPointerInside(false)
  }, [item.id])

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!pointerInside || !item.preview || previewFailed) return

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setPreviewRequested(true)
    }, PREVIEW_DELAY)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [item.preview, pointerInside, previewFailed])

  const previewLoaded = pointerInside && previewRequested && Boolean(item.preview) && !previewFailed
  const posterSrcSet = item.posterSrcSet
    ?.map((source) => `${galleryUrl(source.src)} ${source.width}w`)
    .join(', ')

  return (
    <div
      className={cn('relative overflow-hidden bg-gray-200 dark:bg-gray-900', className)}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => {
        setPointerInside(false)
        setPreviewRequested(false)
        setPreviewReady(false)
      }}
    >
      {!imageReady && !imageFailed ? (
        <div
          className="absolute inset-0 animate-pulse bg-gray-200 motion-reduce:animate-none dark:bg-gray-800"
          aria-hidden
        />
      ) : null}

      {/* Posters are already WebP on the media CDN; skip Next image optimization. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={galleryUrl(item.poster)}
        srcSet={posterSrcSet}
        sizes={posterSrcSet ? '(min-width: 1024px) 50vw, 100vw' : undefined}
        alt=""
        width={item.width}
        height={item.height}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        onLoad={() => setImageReady(true)}
        onError={() => {
          setImageFailed(true)
          setImageReady(true)
        }}
        className={cn(
          'absolute inset-0 h-full w-full object-cover transition-[opacity,filter,transform] duration-500 ease-out',
          imageReady ? 'blur-0 scale-100 opacity-100' : 'scale-[1.02] opacity-0 blur-sm',
          imageClassName
        )}
      />

      {previewLoaded ? (
        <video
          key={item.preview}
          src={galleryUrl(item.preview!)}
          poster={galleryUrl(item.poster)}
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          aria-hidden
          tabIndex={-1}
          onCanPlay={() => setPreviewReady(true)}
          onError={() => {
            setPreviewFailed(true)
            setPreviewReady(false)
          }}
          className={cn(
            'absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 ease-out',
            previewReady && 'opacity-100',
            videoClassName
          )}
        />
      ) : null}

      {previewLoaded && !previewReady ? (
        <div
          className="pointer-events-none absolute inset-0 animate-pulse bg-white/5 motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}

      {children}
    </div>
  )
}
