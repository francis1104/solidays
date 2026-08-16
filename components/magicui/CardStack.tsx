'use client'
import { motion } from 'framer-motion'

export type Card = {
  id: number
  name: string
  designation: string
  content: React.ReactNode
}

export const CardStack = ({
  items,
  offset = 10,
  scaleFactor = 0.06,
  stackDepth = 3,
}: {
  items: Card[]
  offset?: number
  scaleFactor?: number
  stackDepth?: number
}) => {
  const CARD_OFFSET = offset
  const SCALE_FACTOR = scaleFactor
  const layers = Array.from(
    { length: Math.max(items.length, stackDepth) },
    (_, index) => items[index]
  )

  return (
    <div className="relative flex h-60 w-60 items-center justify-center md:h-60 md:w-96">
      {layers.map((card, index) => (
        <motion.div
          key={card ? `${card.id}-${index}` : `stack-placeholder-${index}`}
          className="absolute flex h-60 w-60 flex-col justify-between rounded-3xl border border-neutral-200 bg-white p-4 shadow-xl shadow-black/[0.1] md:h-60 md:w-96 dark:border-white/[0.1] dark:bg-black dark:shadow-white/[0.05]"
          style={{ transformOrigin: 'top center' }}
          animate={{
            top: index * -CARD_OFFSET,
            scale: 1 - index * SCALE_FACTOR,
            zIndex: layers.length - index,
          }}
          aria-hidden={card ? undefined : true}
        >
          {card && (
            <>
              <div className="font-normal whitespace-pre-line text-neutral-700 dark:text-neutral-200">
                {card.content}
              </div>
              <div>
                <p className="font-medium text-neutral-500 dark:text-white">{card.name}</p>
                <p className="font-normal text-neutral-400 dark:text-neutral-200">
                  {card.designation}
                </p>
              </div>
            </>
          )}
        </motion.div>
      ))}
    </div>
  )
}
