'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { GalleryItem } from '@/data/gallery'
import { galleryUrl } from '@/lib/gallery'
import {
  formatClipDate,
  formatDuration,
  formatIndexNumber,
  gameInitials,
  playClipLabel,
} from '@/lib/gallery-format'
import GalleryPlayIcon from './GalleryPlayIcon'

type GalleryIndexProps = {
  items: GalleryItem[]
  previewItem: GalleryItem | undefined
  onHover: (id: string) => void
  onPlay: (id: string) => void
}

export default function GalleryIndex({ items, previewItem, onHover, onPlay }: GalleryIndexProps) {
  const reduceMotion = useReducedMotion()

  if (items.length === 0) {
    return (
      <p className="py-16 text-sm text-gray-500 dark:text-gray-400">
        No clips match these filters.
      </p>
    )
  }

  const previewTitle = previewItem ? (previewItem.game ?? previewItem.title) : ''

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,22rem)]">
      <ul className="min-w-0 divide-y divide-gray-200 dark:divide-gray-800">
        <li className="grid grid-cols-[3.25rem_minmax(0,1fr)_3.5rem_3.75rem] gap-3 py-2 text-[0.65rem] tracking-[0.2em] text-gray-500 uppercase dark:text-gray-400">
          <span>No.</span>
          <span>Title</span>
          <span>Year</span>
          <span className="text-right">Time</span>
        </li>
        {items.map((item, index) => {
          const title = item.game ?? item.title
          const isActive = previewItem?.id === item.id

          return (
            <li key={item.id}>
              <button
                type="button"
                onMouseEnter={() => onHover(item.id)}
                onFocus={() => onHover(item.id)}
                onClick={() => onPlay(item.id)}
                aria-label={playClipLabel(title, item.recordedAt)}
                className={`grid w-full grid-cols-[3.25rem_minmax(0,1fr)_3.5rem_3.75rem] items-center gap-3 py-3 text-left transition-colors ${
                  isActive
                    ? 'bg-primary-500/10 text-gray-950 dark:text-white'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/5'
                }`}
              >
                <span
                  className={`font-mono text-xs tabular-nums ${
                    isActive ? 'text-primary-500' : 'text-gray-400 dark:text-gray-500'
                  }`}
                >
                  {isActive ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="bg-primary-500 inline-block h-3 w-[2px]" aria-hidden />
                      {formatIndexNumber(index)}
                    </span>
                  ) : (
                    formatIndexNumber(index)
                  )}
                </span>
                <span className="truncate text-sm">{title}</span>
                <span className="font-mono text-xs text-gray-500 tabular-nums dark:text-gray-400">
                  {item.recordedAt.slice(0, 4)}
                </span>
                <span className="text-right font-mono text-xs text-gray-500 tabular-nums dark:text-gray-400">
                  {formatDuration(item.duration, true)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <aside className="hidden md:block lg:sticky lg:top-[calc(50vh-8rem)]">
        {previewItem ? (
          <button
            type="button"
            onClick={() => onPlay(previewItem.id)}
            aria-label={playClipLabel(previewTitle, previewItem.recordedAt)}
            className="group w-full text-left outline-none"
          >
            <div className="relative aspect-video overflow-hidden bg-gray-200 dark:bg-gray-900">
              <AnimatePresence mode="wait">
                <motion.img
                  key={previewItem.id}
                  src={galleryUrl(previewItem.poster)}
                  alt=""
                  width={previewItem.width}
                  height={previewItem.height}
                  decoding="async"
                  initial={reduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.18 }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </AnimatePresence>
              <div className="absolute inset-0 bg-black/15 transition-colors group-hover:bg-black/30" />
              <span className="absolute top-3 left-3 font-mono text-xs tracking-[0.22em] text-white/80">
                {gameInitials(previewTitle)}
              </span>
              <span className="absolute inset-0 flex items-center justify-center text-white opacity-80">
                <GalleryPlayIcon className="size-10 drop-shadow-md" />
              </span>
              <span className="absolute right-3 bottom-3 font-mono text-xs text-white tabular-nums">
                {formatDuration(previewItem.duration, true)}
              </span>
            </div>
            <div className="mt-3">
              <p className="text-base text-gray-900 dark:text-gray-100">{previewTitle}</p>
              <p className="mt-1 text-xs tracking-[0.14em] text-gray-500 uppercase dark:text-gray-400">
                {formatClipDate(previewItem.recordedAt)} ·{' '}
                {formatDuration(previewItem.duration, true)}
              </p>
            </div>
          </button>
        ) : null}
      </aside>
    </div>
  )
}
