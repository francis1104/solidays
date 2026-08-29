'use client'

import { HomeEntryPreview, type HomeEntryPreviewData } from './HomeEntryPreview'
import Link from './Link'

export function HomeEntryPreviews({
  gallery,
  fnds,
}: {
  gallery: HomeEntryPreviewData
  fnds: HomeEntryPreviewData
}) {
  return (
    <div className="w-full max-w-3xl space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HomeEntryPreview {...gallery} />
        <HomeEntryPreview {...fnds} />
      </div>
      <Link
        href="/desk"
        className="group hover:border-primary-500 hover:text-primary-500 dark:hover:border-primary-400 dark:hover:text-primary-400 flex items-center justify-between rounded-2xl border border-neutral-200/80 bg-white/70 px-5 py-4 text-sm font-medium tracking-[0.18em] text-neutral-700 uppercase transition-colors focus-visible:outline-none dark:border-white/10 dark:bg-white/[0.03] dark:text-neutral-300"
      >
        <span>Enter the Desk</span>
        <span aria-hidden="true" className="text-lg transition-transform group-hover:translate-x-1">
          →
        </span>
      </Link>
    </div>
  )
}
