import Link from '@/components/site/Link'
import { MagicCard } from '@/components/magicui/magic-card'

export type HomeEntryPreviewData = {
  href: string
  kicker: string
  title: string
  meta?: string
  imageSrc: string
  imageAlt: string
  imageWidth: number
  imageHeight: number
  sizes: string
  srcSet?: string
  imageKind: 'gallery-poster' | 'fnds-still'
}

export function HomeEntryPreview({
  href,
  kicker,
  title,
  meta,
  imageSrc,
  imageAlt,
  imageWidth,
  imageHeight,
  sizes,
  srcSet,
  imageKind,
}: HomeEntryPreviewData) {
  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-2xl focus-visible:outline-none"
      aria-label={`${kicker}: ${title}`}
    >
      <MagicCard className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-white/10">
        <article className="bg-white dark:bg-black">
          <div className="relative aspect-video overflow-hidden bg-neutral-100 dark:bg-neutral-900">
            {/* Gallery posters are already WebP; do not use next/image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              srcSet={srcSet}
              sizes={sizes}
              alt={imageAlt}
              width={imageWidth}
              height={imageHeight}
              loading="lazy"
              data-image-kind={imageKind}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="space-y-1 px-4 py-3">
            <p className="text-[0.65rem] font-medium tracking-[0.22em] text-neutral-500 uppercase dark:text-neutral-400">
              {kicker}
            </p>
            <h2 className="text-base font-semibold tracking-tight text-neutral-900 dark:text-white">
              {title}
            </h2>
            {meta ? (
              <p className="text-xs tracking-wide text-neutral-500 dark:text-neutral-400">{meta}</p>
            ) : null}
          </div>
        </article>
      </MagicCard>
    </Link>
  )
}
