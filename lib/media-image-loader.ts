import type { ImageLoaderProps } from 'next/image'
import { CARD_WIDTHS, type CardWidth } from '@/lib/media'

function selectCardWidth(requestedWidth: number): CardWidth {
  return CARD_WIDTHS.find((candidate) => candidate >= requestedWidth) ?? CARD_WIDTHS.at(-1)!
}

export default function mediaImageLoader({ src, width }: ImageLoaderProps) {
  const placeholderOrigin = 'https://media.local'
  const url = new URL(src, placeholderOrigin)
  const isAbsolute = /^https?:\/\//.test(src)

  url.searchParams.set('variant', 'card')
  url.searchParams.set('width', String(selectCardWidth(width)))

  const transformedUrl = `${url.pathname}${url.search}`
  return isAbsolute ? `${url.origin}${transformedUrl}` : transformedUrl
}
