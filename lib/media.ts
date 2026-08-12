const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')

export function mediaUrl(key: string, fallbackUrl: string) {
  return r2PublicUrl ? `${r2PublicUrl}/${key.replace(/^\//, '')}` : fallbackUrl
}
