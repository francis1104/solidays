'use client'

import { useEffect, useState } from 'react'
import { CardStack } from '@/components/ui/CardStack'
import { useSongContext } from '@/contexts/SongContext'
import { defaultCards, type Card } from '@/data/cards'

export default function HomePage() {
  const { setCards } = useSongContext()
  const [localCards, setLocalCards] = useState<Card[]>(defaultCards)

  useEffect(() => {
    let cancelled = false
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')
    const endpoint = `${apiBaseUrl || ''}/api/cards`

    fetch(endpoint, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error(`Cards API returned ${response.status}`)
        return response.json()
      })
      .then((data: unknown) => {
        if (!Array.isArray(data)) throw new Error('Cards API returned an invalid payload')
        const cards = data as Card[]
        if (!cancelled) {
          setCards(cards)
          setLocalCards(cards.length > 0 ? cards : defaultCards)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCards(defaultCards)
          setLocalCards(defaultCards)
        }
      })

    return () => {
      cancelled = true
    }
  }, [setCards])

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <CardStack
        items={localCards.map((card) => ({
          id: card.id,
          name: card.song,
          designation: card.album,
          content: card.content,
        }))}
      />
    </div>
  )
}
