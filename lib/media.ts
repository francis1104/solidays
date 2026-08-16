const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')

export function mediaUrl(key: string) {
  const normalizedKey = key.replace(/^\//, '')

  if (r2PublicUrl) {
    return `${r2PublicUrl}/${normalizedKey}`
  }

  // The Worker serves private R2 media through /media.
  return `/media/${normalizedKey}`
}
