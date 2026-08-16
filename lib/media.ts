const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.replace(/\/$/, '')

export function mediaUrl(key: string) {
  const normalizedKey = key.replace(/^\//, '')

  if (r2PublicUrl) {
    return `${r2PublicUrl}/${normalizedKey}`
  }

  // The Worker serves private R2 media through /media.
  return `/media/${normalizedKey}`
}

// /media 卡片变体允许的宽度；前端 media-image-loader 和
// app/media/[...key]/route.ts 共用这一份契约，宽度不在列表内时接口返回 400。
export const CARD_WIDTHS = [320, 480, 640] as const

export type CardWidth = (typeof CARD_WIDTHS)[number]

const mediaKeyPattern = /^(?:fnds|profile)\/[A-Za-z0-9._/-]+$/

export function isAllowedMediaKey(key: string) {
  return mediaKeyPattern.test(key) && !key.includes('..')
}
