'use client'

import React, { useEffect } from 'react'
import Image from 'next/image'
import { DraggableCardBody, DraggableCardContainer } from '@/components/ui/draggable-card'
import { mediaUrl } from '@/lib/media'

const items = [
  {
    title: '致明日的舞',
    image: mediaUrl('fnds/01-zhi-ming-ri-de-wu.jpg'),
    className: 'absolute top-10 left-[20%] rotate-[-5deg]',
  },
  {
    title: 'Melody',
    image: mediaUrl('fnds/02-melody.jpg'),
    className: 'absolute top-40 left-[25%] rotate-[-7deg]',
  },
  {
    title: '我们',
    image: mediaUrl('fnds/03-wo-men.jpg'),
    className: 'absolute top-5 left-[40%] rotate-[8deg]',
  },
  {
    title: '杭州站',
    image: mediaUrl('fnds/04-hang-zhou.jpg'),
    className: 'absolute top-32 left-[55%] rotate-[10deg]',
  },
  {
    title: '任我行',
    image: mediaUrl('fnds/05-ren-wo-xing.jpg'),
    className: 'absolute top-20 right-[35%] rotate-[2deg]',
  },
  {
    title: '澳门8.3',
    image: mediaUrl('fnds/06-ao-men.jpg'),
    className: 'absolute top-24 left-[45%] rotate-[-7deg]',
  },
  {
    title: '忽然007',
    image: mediaUrl('fnds/07-hu-ran-007.jpg'),
    className: 'absolute top-8 left-[30%] rotate-[4deg]',
  },
]

export default function FndsPage() {
  useEffect(() => {
    const preloadLinks = items.map((item) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = item.image
      document.head.appendChild(link)
      return link
    })

    return () => preloadLinks.forEach((link) => link.remove())
  }, [])

  return (
    <DraggableCardContainer className="relative flex min-h-screen w-full items-center justify-center overflow-clip">
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-3/4 flex-col items-center text-center">
        <div className="mb-4 text-sm font-extrabold tracking-wider text-neutral-400 md:text-base dark:text-neutral-500">
          FEAR <span className="text-[#DD345E]">and DREAMS</span>
        </div>

        <div className="text-5xl leading-tight font-extrabold text-[#FBF050] uppercase md:text-7xl lg:text-[6rem]">
          <div>NOW IS</div>
          <div>THE ONLY</div>
          <div>REALITY</div>
        </div>
      </div>
      {items.map((item, index) => (
        <DraggableCardBody key={item.title} className={item.className}>
          <Image
            src={item.image}
            alt={item.title}
            width={320}
            height={320}
            className="pointer-events-none relative z-10 h-80 w-80 object-cover"
            priority={index > 2}
            loading={index > 2 ? undefined : 'lazy'}
            quality={85}
            unoptimized
          />
          <h3 className="mt-4 text-center text-2xl font-bold text-neutral-700 dark:text-neutral-300">
            {item.title}
          </h3>
        </DraggableCardBody>
      ))}
    </DraggableCardContainer>
  )
}
