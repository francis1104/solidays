'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { GalleryItem } from '@/data/gallery'
import GalleryCard from './GalleryCard'
import GalleryIndex from './GalleryIndex'

type GalleryArchiveProps = {
  items: GalleryItem[]
  years: string[]
  year: string
  query: string
  view: 'grid' | 'index'
  previewItem: GalleryItem | undefined
  onYearChange: (year: string) => void
  onQueryChange: (query: string) => void
  onViewChange: (view: 'grid' | 'index') => void
  onIndexHover: (id: string) => void
  onPlay: (id: string) => void
}

export default function GalleryArchive({
  items,
  years,
  year,
  query,
  view,
  previewItem,
  onYearChange,
  onQueryChange,
  onViewChange,
  onIndexHover,
  onPlay,
}: GalleryArchiveProps) {
  return (
    <section className="border-t border-gray-200 pt-10 pb-24 dark:border-gray-800">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[0.7rem] tracking-[0.28em] text-gray-500 uppercase dark:text-gray-400">
            Archive
          </p>
          <p className="mt-2 font-mono text-2xl text-gray-950 tabular-nums dark:text-white">
            {String(items.length).padStart(2, '0')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {['all', ...years].map((value) => {
            const isActive = year === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => onYearChange(value)}
                aria-pressed={isActive}
                className={`tracking-[0.14em] uppercase ${
                  isActive
                    ? 'text-primary-500'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                }`}
              >
                {value === 'all' ? 'All' : value}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search games</span>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search games"
              className="focus:border-primary-500 w-full border-0 border-b border-gray-300 bg-transparent py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
          </label>

          <div className="hidden items-center gap-3 text-xs tracking-[0.18em] uppercase lg:flex">
            <button
              type="button"
              onClick={() => onViewChange('grid')}
              aria-pressed={view === 'grid'}
              className={view === 'grid' ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'}
            >
              Grid
            </button>
            <span className="text-gray-300 dark:text-gray-700" aria-hidden>
              /
            </span>
            <button
              type="button"
              onClick={() => onViewChange('index')}
              aria-pressed={view === 'index'}
              className={view === 'index' ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'}
            >
              Index
            </button>
          </div>
        </div>
      </div>

      <div className="mt-10 lg:hidden">
        <GalleryGrid items={items} onPlay={onPlay} />
      </div>

      <div className="mt-10 hidden lg:block">
        {view === 'grid' ? (
          <GalleryGrid items={items} onPlay={onPlay} />
        ) : (
          <GalleryIndex
            items={items}
            previewItem={previewItem}
            onHover={onIndexHover}
            onPlay={onPlay}
          />
        )}
      </div>
    </section>
  )
}

function GalleryGrid({ items, onPlay }: { items: GalleryItem[]; onPlay: (id: string) => void }) {
  const reduceMotion = useReducedMotion()

  if (items.length === 0) {
    return (
      <p className="py-16 text-sm text-gray-500 dark:text-gray-400">
        No clips match these filters.
      </p>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-x-5 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.li
            key={item.id}
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <GalleryCard item={item} onPlay={onPlay} />
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
