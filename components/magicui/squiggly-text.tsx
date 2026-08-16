'use client'

import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/components/lib/utils'

type SquigglyTextProps = {
  children: ReactNode
  steps?: number
  stepDuration?: number
  scale?: number | [number, number]
  baseFrequency?: number
  numOctaves?: number
  as?: 'span' | 'div'
  className?: string
  style?: CSSProperties
}

/**
 * A small, dependency-free version of Aceternity's animated squiggly text.
 * The SVG filters are kept in the DOM and the active displacement frame is
 * swapped on a short interval so the text stays lightweight and deterministic.
 */
export function SquigglyText({
  children,
  steps = 5,
  stepDuration = 80,
  scale = [6, 8],
  baseFrequency = 0.02,
  numOctaves = 3,
  as = 'span',
  className,
  style,
}: SquigglyTextProps) {
  const [activeStep, setActiveStep] = useState(0)
  const rawId = useId()
  const id = rawId.replace(/:/g, '')
  const frameCount = Math.max(1, Math.floor(steps))

  const frames = useMemo(
    () =>
      Array.from({ length: frameCount }, (_, index) => ({
        id: `${id}-filter-${index}`,
        seed: 100 + index,
        scale: Array.isArray(scale) ? scale[index % scale.length] : scale,
      })),
    [frameCount, id, scale]
  )

  useEffect(() => {
    if (frames.length < 2) return

    const interval = window.setInterval(
      () => {
        setActiveStep((current) => (current + 1) % frames.length)
      },
      Math.max(16, stepDuration)
    )

    return () => window.clearInterval(interval)
  }, [frames.length, stepDuration])

  const Tag = as
  const activeFilter = frames[activeStep]?.id ?? frames[0].id

  return (
    <>
      <svg aria-hidden="true" className="absolute h-0 w-0 overflow-hidden">
        <defs>
          {frames.map((frame) => (
            <filter
              key={frame.id}
              id={frame.id}
              x="-10%"
              y="-20%"
              width="120%"
              height="140%"
              colorInterpolationFilters="sRGB"
            >
              <feTurbulence
                type="fractalNoise"
                baseFrequency={baseFrequency}
                numOctaves={numOctaves}
                seed={frame.seed}
                result="noise"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={frame.scale}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          ))}
        </defs>
      </svg>

      <Tag
        className={cn('inline-block', className)}
        style={{ ...style, filter: `url(#${activeFilter})` }}
      >
        {children}
      </Tag>
    </>
  )
}
