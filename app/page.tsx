import { CardStack } from '@/components/ui/CardStack'
import { defaultCards } from '@/data/cards'

export default function HomePage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <CardStack
        items={defaultCards.map((card) => ({
          id: card.id,
          name: card.song,
          designation: card.album,
          content: card.content,
        }))}
        stackDepth={3}
      />
    </div>
  )
}
