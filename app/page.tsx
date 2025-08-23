'use client'
import { useEffect, useState } from 'react'
import { CardStack } from '../components/ui/CardStack'
import { useSongContext } from '@/contexts/SongContext'

type Card = {
  id: number
  song: string
  album: string
  content: string
}

export default function Page() {
  const { cards, setCards } = useSongContext()
  const [localCards, setLocalCards] = useState<Card[]>([])

  useEffect(() => {
    fetch(process.env.NEXT_PUBLIC_API_URL + '/api/cards')
      .then((res) => res.json())
      .then((data) => {
        setCards(data) // 更新Context中的数据，供音乐播放器使用
        setLocalCards(data) // 更新本地状态，供页面显示使用
      })
      .catch(() => {
        const defaultCards: Card[] = [
          {
            id: 0,
            song: '歌颂',
            album: '《Solidays 新曲+精选》',
            content: '风景裡随身听\n思想裡随心听\n怀著万万万个心的结晶\n炼成时代 最亮发声。',
          },
        ]
        setCards(defaultCards)
        setLocalCards(defaultCards)
      })
  }, [setCards])
  const defaultCards: Card[] = [
    {
      id: 0,
      song: '歌颂',
      album: '《Solidays 新曲+精选》',
      content: '风景裡随身听\n思想裡随心听\n怀著万万万个心的结晶\n炼成时代 最亮发声。',
    },
  ]

  const displayCards = localCards.length > 0 ? localCards : defaultCards

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <CardStack
        items={displayCards.map((card) => ({
          id: card.id,
          name: card.song,
          designation: card.album,
          content: card.content,
        }))}
      />
    </div>
  )
}
