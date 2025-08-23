import React from 'react'
import { DraggableCardBody, DraggableCardContainer } from '@/components/ui/draggable-card'
import Image from 'next/image'

export default function FndsPage() {
  const items = [
    {
      title: '致明日的舞',
      image:
        'https://dlink.host/1drv/aHR0cHM6Ly8xZHJ2Lm1zL3UvYy9hNzRkYWEzODEyMTFlMzljL0VXUzBEQktSYkM1T21pZzJ5OTJLNlRVQmRjSXZjb19aN3l3dm5kaDhrOXdEMVE_ZT12NXY2alo.jpg',
      className: 'absolute top-10 left-[20%] rotate-[-5deg]',
    },
    {
      title: 'Melody',
      image:
        'https://dlink.host/1drv/aHR0cHM6Ly8xZHJ2Lm1zL2kvYy9hNzRkYWEzODEyMTFlMzljL0VmV001bENOeEdoTnVRZkdCdlRHanBjQl83cnNLMmlMbUo5UVctRkZoa0w2RWc_ZT04TFJoUTA.jpg',
      className: 'absolute top-40 left-[25%] rotate-[-7deg]',
    },
    {
      title: '我们',
      image:
        'https://dlink.host/1drv/aHR0cHM6Ly8xZHJ2Lm1zL3UvYy9hNzRkYWEzODEyMTFlMzljL0ViMmJVM2s2NEZ4TmxSX0doeUx3aExzQnBYek9CMVVMWGp6SGdHZE50bjJKeGc_ZT15QWJqcHo.jpg',
      className: 'absolute top-5 left-[40%] rotate-[8deg]',
    },
    {
      title: '杭州站',
      image:
        'https://dlink.host/1drv/aHR0cHM6Ly8xZHJ2Lm1zL2kvYy9hNzRkYWEzODEyMTFlMzljL0VaempFUkk0cWswZ2dLZXh2UUVBQUFBQmhJOXF6WndnWW5ZVm8zMl96WW5fakE_ZT1iYlBKTGQ.jpg',
      className: 'absolute top-32 left-[55%] rotate-[10deg]',
    },
    {
      title: '任我行',
      image:
        'https://dlink.host/1drv/aHR0cHM6Ly8xZHJ2Lm1zL2kvYy9hNzRkYWEzODEyMTFlMzljL0VaempFUkk0cWswZ2dLY2V2Z0VBQUFBQlU4LWU2Q01oMTFmYWttX1ZyakR1MXc_ZT02NFhtU28.jpg',
      className: 'absolute top-20 right-[35%] rotate-[2deg]',
    },
    {
      title: '澳门8.3',
      image:
        'https://dlink.host/1drv/aHR0cHM6Ly8xZHJ2Lm1zL3UvYy9hNzRkYWEzODEyMTFlMzljL0VkZ01SVXBOTVk5Q2txV25oUHB0QlBBQjNUVXJ2X0d2bTFoSjc2Snh2SjB4QXc_ZT03VkZZdWE.jpg',
      className: 'absolute top-24 left-[45%] rotate-[-7deg]',
    },
    {
      title: '忽然007',
      image:
        'https://dlink.host/1drv/aHR0cHM6Ly8xZHJ2Lm1zL3UvYy9hNzRkYWEzODEyMTFlMzljL0VTdnp0OEhfeVA1Q3FXM3F5X2duSlZ3QlE1MnFuLUhMUjhGMDhhdGpnTlhHRGc_ZT1YM2JMY3Y.jpg',
      className: 'absolute top-8 left-[30%] rotate-[4deg]',
    },
  ]
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
      {items.map((item) => (
        <DraggableCardBody key={item.title} className={item.className}>
          <Image
            src={item.image}
            alt={item.title}
            width={320}
            height={320}
            className="pointer-events-none relative z-10 h-80 w-80 object-cover"
            loading="lazy"
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
