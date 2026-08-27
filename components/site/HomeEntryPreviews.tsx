'use client'

import { HomeEntryPreview, type HomeEntryPreviewData } from './HomeEntryPreview'

export function HomeEntryPreviews({
  gallery,
  fnds,
}: {
  gallery: HomeEntryPreviewData
  fnds: HomeEntryPreviewData
}) {
  return (
    <div className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
      <HomeEntryPreview {...gallery} />
      <HomeEntryPreview {...fnds} />
    </div>
  )
}
