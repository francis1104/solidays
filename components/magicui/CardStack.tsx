'use client'

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Play } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/components/lib/utils'

export type CardStackItem = {
  id: number
  name: string
  designation: string
  content: ReactNode
}

export type CardStackProps = {
  items: CardStackItem[]
  offset?: number
  scaleFactor?: number
  stackDepth?: number
  /** 正面卡 id 变化时才调用（含初次）。id 未变必须 no-op */
  onFrontChange?: (item: CardStackItem) => void
  onPlay?: (item: CardStackItem) => void
  canPlayFront?: boolean
  className?: string
}

function itemsSignature(items: CardStackItem[]) {
  return items
    .map((item) => `${item.id}:${typeof item.content === 'string' ? item.content : ''}`)
    .join('|')
}

export const CardStack = ({
  items,
  offset = 10,
  scaleFactor = 0.06,
  stackDepth = 3,
  onFrontChange,
  onPlay,
  canPlayFront = false,
  className,
}: CardStackProps) => {
  const CARD_OFFSET = offset
  const SCALE_FACTOR = scaleFactor
  const reduceMotion = useReducedMotion()
  const [order, setOrder] = useState<CardStackItem[]>(items)
  const lastNotifiedId = useRef<number | null>(null)
  const signature = itemsSignature(items)

  useEffect(() => {
    setOrder(items)
    lastNotifiedId.current = null
    // Reset only when ids/lyrics change, not when the parent passes a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const front = order[0]
  const next = order[1]

  useEffect(() => {
    if (!front) return
    if (front.id === lastNotifiedId.current) return
    lastNotifiedId.current = front.id
    onFrontChange?.(front)
  }, [front, onFrontChange])

  const visible = order.slice(0, stackDepth)
  const layers = Array.from({ length: stackDepth }, (_, index) => visible[index])
  const canCycle = order.length > 1

  const cycle = () => {
    setOrder((prev) => {
      if (prev.length < 2) return prev
      const [first, ...rest] = prev
      return [...rest, first]
    })
  }

  const playFront = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!front || !canPlayFront) return
    onPlay?.(front)
  }

  return (
    <TooltipProvider>
      <div
        role="region"
        aria-roledescription="歌词卡片堆"
        aria-label={front ? `当前歌词：${front.name}` : '歌词卡片堆'}
        className={cn('flex flex-col items-center gap-3', className)}
      >
        <div className="relative flex h-60 w-60 items-center justify-center md:h-60 md:w-96">
          {layers.map((card, index) => {
            const isFront = index === 0 && Boolean(card)

            return (
              <motion.div
                key={card ? card.id : `stack-placeholder-${index}`}
                style={{ transformOrigin: 'top center' }}
                animate={{
                  top: index * -CARD_OFFSET,
                  scale: 1 - index * SCALE_FACTOR,
                  zIndex: layers.length - index,
                }}
                transition={reduceMotion ? { duration: 0 } : undefined}
                aria-hidden={isFront ? undefined : true}
                className={cn(
                  'absolute flex h-60 w-60 flex-col justify-between rounded-3xl border border-neutral-200 bg-white p-4 shadow-xl shadow-black/[0.1] md:h-60 md:w-96 dark:border-white/[0.1] dark:bg-black dark:shadow-white/[0.05]',
                  !isFront && 'pointer-events-none'
                )}
              >
                {card && (
                  <>
                    <button
                      type="button"
                      className={cn(
                        'w-full flex-1 text-left font-normal whitespace-pre-line text-neutral-700 dark:text-neutral-200',
                        isFront && canCycle ? 'cursor-pointer' : 'cursor-default'
                      )}
                      onClick={isFront ? cycle : undefined}
                      disabled={!isFront || !canCycle}
                      aria-label={
                        isFront && canCycle ? `下一张歌词：${next?.name ?? card.name}` : undefined
                      }
                    >
                      {card.content}
                    </button>
                    <div className="flex items-end justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-neutral-500 dark:text-white">{card.name}</p>
                        <p className="font-normal text-neutral-400 dark:text-neutral-200">
                          {card.designation}
                        </p>
                      </div>
                      {isFront && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={playFront}
                              disabled={!canPlayFront}
                              aria-label={
                                canPlayFront ? `播放 ${card.name}` : `播放 ${card.name}，暂无音频`
                              }
                              className={cn(
                                'inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-white/80 dark:bg-black/60',
                                canPlayFront
                                  ? 'text-primary-500 hover:text-primary-600 dark:text-primary-400 border-neutral-200 dark:border-white/10'
                                  : 'cursor-not-allowed border-neutral-200 text-neutral-400 opacity-50 dark:border-white/10 dark:text-neutral-500'
                              )}
                            >
                              <Play className="size-3.5 fill-current" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{canPlayFront ? `播放 ${card.name}` : '暂无音频'}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={cycle}
          disabled={!canCycle}
          aria-label={`下一张歌词：${next?.name ?? front?.name ?? ''}`}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium tracking-wide text-neutral-500 uppercase disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-400"
        >
          下一张
          <ChevronDown className="size-3.5" />
        </button>
      </div>
    </TooltipProvider>
  )
}
