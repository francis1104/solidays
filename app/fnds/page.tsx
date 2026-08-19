'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { DraggableCardBody, DraggableCardContainer } from '@/components/magicui/draggable-card'
import { SquigglyText } from '@/components/magicui/squiggly-text'
import { mediaUrl } from '@/lib/media'
import mediaImageLoader from '@/lib/media-image-loader'

const items = [
  {
    title: '致明日的舞',
    image: mediaUrl('fnds/01-zhi-ming-ri-de-wu.jpg'),
    className:
      'fnds-card-0 absolute top-[18%] left-[8%] z-10 rotate-[-4deg] sm:top-10 sm:left-[20%] sm:rotate-[-5deg]',
  },
  {
    title: 'Melody',
    image: mediaUrl('fnds/02-melody.jpg'),
    className:
      'fnds-card-1 absolute top-[27%] left-[13%] z-10 rotate-[-6deg] sm:top-40 sm:left-[25%] sm:rotate-[-7deg]',
  },
  {
    title: '我们',
    image: mediaUrl('fnds/03-wo-men.jpg'),
    className:
      'fnds-card-2 absolute top-[20%] left-[16%] z-10 rotate-[5deg] sm:top-5 sm:left-[40%] sm:rotate-[8deg]',
  },
  {
    title: '杭州站',
    image: mediaUrl('fnds/04-hang-zhou.jpg'),
    className:
      'fnds-card-3 absolute top-[30%] left-[10%] z-10 rotate-[6deg] sm:top-32 sm:left-[55%] sm:rotate-[10deg]',
  },
  {
    title: '任我行',
    image: mediaUrl('fnds/05-ren-wo-xing.jpg'),
    className:
      'fnds-card-4 absolute top-[24%] left-[6%] z-10 rotate-[2deg] sm:top-20 sm:right-[35%] sm:left-auto',
  },
  {
    title: '澳门8.3',
    image: mediaUrl('fnds/06-ao-men.jpg'),
    className:
      'fnds-card-5 absolute top-[32%] left-[15%] z-10 rotate-[-5deg] sm:top-24 sm:left-[45%] sm:rotate-[-7deg]',
  },
  {
    title: '忽然007',
    image: mediaUrl('fnds/07-hu-ran-007.jpg'),
    className:
      'fnds-card-6 absolute top-[22%] left-[12%] z-10 rotate-[3deg] sm:top-8 sm:left-[30%] sm:rotate-[4deg]',
  },
]

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
  const layoutKey = isMobileLayout ? 'mobile' : 'desktop'

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
          key={`${layoutKey}-${item.title}`}
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
          <h3 className="mt-2 text-center text-lg font-bold text-neutral-700 sm:mt-4 sm:text-2xl dark:text-neutral-300">
            {item.title}
          </h3>
        </DraggableCardBody>
      ))}
    </DraggableCardContainer>
  )
}
