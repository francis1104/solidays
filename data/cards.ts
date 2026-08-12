export type Card = {
  id: number
  song: string
  album: string
  content: string
}

// Temporary fallback data. Replace this source with D1 when structured content is ready.
export const defaultCards: Card[] = [
  {
    id: 0,
    song: '歌颂',
    album: '《Solidays 新曲+精选》',
    content: '风景裡随身听\n思想裡随心听\n怀著万万万个心的结晶\n炼成时代 最亮发声。',
  },
]
