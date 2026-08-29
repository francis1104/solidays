'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { DraggableCardBody, DraggableCardContainer } from '@/components/magicui/draggable-card'
import { SquigglyText } from '@/components/magicui/squiggly-text'
import mediaImageLoader from '@/lib/media-image-loader'
import { fndsItems as items } from '@/data/fnds'

const cardSizeClassName =
  'w-[80vw] max-w-[300px] min-h-0 p-3 sm:w-80 sm:max-w-none sm:min-h-96 sm:p-6'

const mobileLayoutQuery = '(max-width: 639px), (max-height: 520px)'

function useMobileFndsLayout() {
  const [isMobileLayout, setIsMobileLayout] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(mobileLayoutQuery)
    const updateLayout = () => setIsMobileLayout(mediaQuery.matches)

    updateLayout()
    mediaQuery.addEventListener('change', updateLayout)

    return () => mediaQuery.removeEventListener('change', updateLayout)
  }, [])

  return isMobileLayout
}

export default function FndsPage() {
  const mobileConstraintsRef = useRef<HTMLDivElement>(null)
  const isMobileLayout = useMobileFndsLayout()

  return (
    <DraggableCardContainer className="fnds-page relative flex min-h-0 w-full flex-1 items-center justify-center overflow-clip">
      <div
        ref={mobileConstraintsRef}
        aria-hidden="true"
        className="fnds-mobile-constraints pointer-events-none absolute z-0"
      />
      <div
        data-fnds-copy
        className="pointer-events-none absolute inset-x-0 top-[48%] z-0 flex -translate-y-1/2 flex-col items-center text-center select-none sm:top-1/2 sm:-translate-y-3/4"
      >
        <div className="mb-2 text-sm font-extrabold tracking-wider text-neutral-400 md:text-base dark:text-neutral-500">
          FEAR <span className="text-[#DD345E]">and DREAMS</span>
        </div>

        <div
          data-fnds-copy-title
          className="text-[clamp(2.7rem,13vw,3.4rem)] leading-[0.92] font-extrabold whitespace-nowrap text-[#FBF050] uppercase sm:text-7xl sm:leading-tight lg:text-[6rem]"
          style={{ fontFamily: 'var(--font-oswald)' }}
        >
          <div>NOW IS</div>
          <div>THE ONLY</div>
          <div>
            <SquigglyText as="span" steps={5} stepDuration={100} scale={[5, 7]}>
              REALITY
            </SquigglyText>
          </div>
        </div>
      </div>
      {items.map((item, index) => (
        <DraggableCardBody
          key={item.title}
          constraintsRef={isMobileLayout ? mobileConstraintsRef : undefined}
          className={`${cardSizeClassName} ${item.className}`}
        >
          <Image
            loader={mediaImageLoader}
            src={item.image}
            alt={item.title}
            width={320}
            height={320}
            sizes="(max-width: 639px) 80vw, 320px"
            className="pointer-events-none relative z-10 aspect-square h-auto w-full object-cover sm:h-80 sm:w-80"
            priority={index >= items.length - 2}
            loading={index >= items.length - 2 ? undefined : 'lazy'}
            quality={75}
          />
        </DraggableCardBody>
      ))}
    </DraggableCardContainer>
  )
}
