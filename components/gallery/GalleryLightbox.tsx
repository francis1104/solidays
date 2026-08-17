'use client'

import { useEffect } from 'react'
import Lightbox from 'yet-another-react-lightbox'
import Counter from 'yet-another-react-lightbox/plugins/counter'
import Video from 'yet-another-react-lightbox/plugins/video'
import 'yet-another-react-lightbox/plugins/counter.css'
import 'yet-another-react-lightbox/styles.css'
import type { GalleryItem } from '@/data/gallery'
import { galleryUrl } from '@/lib/gallery'
import { formatLightboxMeta } from '@/lib/gallery-format'
import { useSongContext } from '@/contexts/SongContext'

type GalleryLightboxProps = {
  items: GalleryItem[]
  activeId: string | null
  onActiveIdChange: (id: string | null) => void
}

export default function GalleryLightbox({
  items,
  activeId,
  onActiveIdChange,
}: GalleryLightboxProps) {
  const { pause } = useSongContext()
  const index = activeId ? items.findIndex((item) => item.id === activeId) : -1
  const open = index >= 0

  useEffect(() => {
    if (!open) return

    const onPlay = (event: Event) => {
      if (event.target instanceof HTMLVideoElement) {
        pause()
      }
    }

    document.addEventListener('play', onPlay, true)
    return () => document.removeEventListener('play', onPlay, true)
  }, [open, pause])

  return (
    <Lightbox
      open={open}
      close={() => onActiveIdChange(null)}
      index={Math.max(index, 0)}
      slides={items.map((item) => ({
        type: 'video' as const,
        width: item.width,
        height: item.height,
        poster: galleryUrl(item.poster),
        sources: [{ src: galleryUrl(item.video), type: 'video/mp4' }],
      }))}
      plugins={[Video, Counter]}
      carousel={{ preload: 0 }}
      controller={{ closeOnBackdropClick: true }}
      video={{
        controls: true,
        playsInline: true,
        preload: 'metadata',
        autoPlay: false,
      }}
      counter={{ separator: ' / ' }}
      className="gallery-lightbox"
      on={{
        view: ({ index: nextIndex }) => {
          const nextItem = items[nextIndex]
          if (nextItem && nextItem.id !== activeId) {
            onActiveIdChange(nextItem.id)
          }
        },
      }}
      render={{
        slideFooter: ({ slide }) => {
          if (slide.type !== 'video') return null
          const item = items.find((entry) => galleryUrl(entry.video) === slide.sources[0]?.src)
          if (!item) return null

          return (
            <div className="gallery-lightbox-meta">
              <p className="text-base tracking-[0.16em] text-white uppercase">
                {item.game ?? item.title}
              </p>
              <p className="mt-1 text-xs tracking-[0.14em] text-gray-300 uppercase">
                {formatLightboxMeta(item.recordedAt, item.duration, item.type)}
              </p>
            </div>
          )
        },
      }}
    />
  )
}
