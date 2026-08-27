'use client'

import { useCallback } from 'react'
import { CardStack, type CardStackItem } from '@/components/magicui/CardStack'
import { defaultCards } from '@/data/cards'
import { useSongContext } from '@/contexts/SongContext'

const HOME_STACK_ITEMS: CardStackItem[] = defaultCards.map((card) => ({
  id: card.id,
  name: card.song,
  designation: card.album,
  content: card.content,
}))

export function HomeLyricStack() {
  const { activeCardId, setActiveCardId, requestPlay, canPlayCard } = useSongContext()

  const onFrontChange = useCallback(
    (item: CardStackItem) => {
      if (item.id === activeCardId) return
      setActiveCardId(item.id)
    },
    [activeCardId, setActiveCardId]
  )

  return (
    <CardStack
      items={HOME_STACK_ITEMS}
      stackDepth={3}
      canPlayFront={canPlayCard(activeCardId)}
      onFrontChange={onFrontChange}
      onPlay={(item) => {
        void requestPlay(item.id)
      }}
    />
  )
}
