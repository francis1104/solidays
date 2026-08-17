'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { GalleryItem } from '@/data/gallery'
import { galleryUrl } from '@/lib/gallery'
import {
  formatClipDate,
  formatClipPosition,
  formatDuration,
  playClipLabel,
} from '@/lib/gallery-format'
import GalleryPlayIcon from './GalleryPlayIcon'

type GalleryHeroProps = {
  featuredItems: GalleryItem[]
  featuredItem: GalleryItem
  clipCount: number
  clipIndex: number
  yearSpan: { start: string; end: string }
  onFeaturedChange: (id: string) => void
  onPlay: (id: string) => void
}

export default function GalleryHero({
  featuredItems,
  featuredItem,
  clipCount,
  clipIndex,
  yearSpan,
  onFeaturedChange,
  onPlay,
}: GalleryHeroProps) {
  const reduceMotion = useReducedMotion()
  const title = featuredItem.game ?? featuredItem.title
  const yearLabel =
    yearSpan.start && yearSpan.end && yearSpan.start !== yearSpan.end
      ? `${yearSpan.start}—${yearSpan.end}`
      : yearSpan.end

  return (
    <section className="grid items-end gap-10 pb-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
      <div className="min-w-0">
        <p className="text-[0.7rem] font-medium tracking-[0.28em] text-gray-500 uppercase dark:text-gray-400">
          Personal Video Archive
        </p>
        <h1 className="mt-3 text-[clamp(3.25rem,12vw,7.5rem)] leading-[0.82] font-semibold tracking-[-0.06em] text-gray-950 uppercase dark:text-white">
          Gallery
        </h1>
        <p className="mt-5 max-w-md text-base text-gray-600 dark:text-gray-300">
          Fragments from worlds I have been to.
        </p>
        <p className="mt-3 text-xs tracking-[0.22em] text-gray-500 uppercase dark:text-gray-400">
          {clipCount} clips · {yearLabel}
        </p>

        <ul className="mt-8 space-y-2">
          {featuredItems.map((item) => {
            const gameName = item.game ?? item.title
            const isActive = item.id === featuredItem.id || item.game === featuredItem.game

            return (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseEnter={() => onFeaturedChange(item.id)}
                  onFocus={() => onFeaturedChange(item.id)}
                  onClick={() => onFeaturedChange(item.id)}
                  aria-pressed={isActive}
                  className={`block text-left text-sm tracking-[0.18em] uppercase transition-colors ${
                    isActive
                      ? 'text-primary-500'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  {gameName}
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => onPlay(featuredItem.id)}
        aria-label={playClipLabel(title, featuredItem.recordedAt)}
        className="group relative w-full overflow-hidden bg-gray-200 text-left dark:bg-gray-900"
      >
        <div className="relative aspect-video">
          <AnimatePresence mode="wait">
            <motion.img
              key={featuredItem.id}
              src={galleryUrl(featuredItem.poster)}
              alt=""
              width={featuredItem.width}
              height={featuredItem.height}
              decoding="async"
              fetchPriority="high"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2 }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-black/10" />
          <span className="absolute inset-0 flex items-center justify-center text-white opacity-80 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="flex size-14 items-center justify-center rounded-full border border-white/40 bg-black/20 backdrop-blur-sm">
              <GalleryPlayIcon className="size-6" />
            </span>
          </span>
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 text-white">
            <div className="min-w-0">
              <p className="truncate text-lg font-medium tracking-wide">{title}</p>
              <p className="mt-1 text-xs tracking-[0.16em] text-white/75 uppercase">
                {formatClipDate(featuredItem.recordedAt)} · {formatDuration(featuredItem.duration)}
              </p>
            </div>
            <p className="shrink-0 font-mono text-xs tracking-widest text-white/70 tabular-nums">
              {formatClipPosition(clipIndex, clipCount)}
            </p>
          </div>
        </div>
      </button>
    </section>
  )
}
