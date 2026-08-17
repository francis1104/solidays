'use client'

import type { GalleryItem } from '@/data/gallery'
import { formatClipDate, formatDuration, playClipLabel } from '@/lib/gallery-format'
import GalleryMediaPreview from './GalleryMediaPreview'
import GalleryPlayIcon from './GalleryPlayIcon'

type GalleryCardProps = {
  item: GalleryItem
  onPlay: (id: string) => void
}

export default function GalleryCard({ item, onPlay }: GalleryCardProps) {
  const title = item.game ?? item.title

  return (
    <button
      type="button"
      onClick={() => onPlay(item.id)}
      aria-label={playClipLabel(title, item.recordedAt)}
      className="group w-full text-left outline-none"
    >
      <div className="relative aspect-video overflow-hidden bg-gray-200 dark:bg-gray-900">
        <GalleryMediaPreview
          item={item}
          className="absolute inset-0"
          imageClassName="transition-transform duration-300 ease-out group-hover:scale-[1.03] group-focus-visible:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100 motion-reduce:group-focus-visible:scale-100"
        >
          <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/25 group-focus-visible:bg-black/25 motion-reduce:transition-none dark:group-hover:bg-black/35" />
          <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
            <GalleryPlayIcon className="size-10 drop-shadow-md" />
          </span>
          <span className="absolute right-2 bottom-2 font-mono text-xs tracking-wide text-white tabular-nums">
            {formatDuration(item.duration)}
          </span>
        </GalleryMediaPreview>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-gray-800 dark:text-gray-200">{title}</span>
        <time
          dateTime={item.recordedAt}
          className="shrink-0 text-xs tracking-wide text-gray-500 uppercase dark:text-gray-400"
        >
          {formatClipDate(item.recordedAt)}
        </time>
      </div>
    </button>
  )
}
