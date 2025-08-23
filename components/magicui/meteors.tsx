'use client'
import React, { useEffect, useState } from 'react'

// 这是一个简单的流星动画组件，支持主题切换（昼夜模式）
// 你可以根据 MagicUI 官方文档进一步自定义参数和样式

export interface MeteorsProps {
  number?: number
  minDelay?: number
  maxDelay?: number
  minDuration?: number
  maxDuration?: number
  angle?: number
  className?: string
}

const Meteors: React.FC<MeteorsProps> = ({
  number = 20,
  minDelay = 0.5,
  maxDelay = 2.5,
  minDuration = 2,
  maxDuration = 5,
  angle = -65,
  className = '',
}) => {
  const [meteors, setMeteors] = useState<
    Array<{
      left: number
      top: number
      animationDelay: number
      animationDuration: number
      depth: number
      size: number
      trail: number
      opacity: number
      color: string
    }>
  >([])

  useEffect(() => {
    const arr = Array.from({ length: number }, () => {
      // depth: 0 最近，1 最远
      const depth = Math.random()
      // 近的更快更亮更大，远的更慢更暗更小
      const size = 1 + (1 - depth) * 2 // 1~3px
      const trail = 30 + (1 - depth) * 40 // 30~70px
      const opacity = 0.4 + (1 - depth) * 0.6 // 0.4~1
      const color =
        depth < 0.3
          ? 'bg-blue-300 dark:bg-blue-200'
          : depth < 0.7
            ? 'bg-zinc-400 dark:bg-blue-100'
            : 'bg-zinc-500 dark:bg-blue-50'
      // 近的更快，慢的更慢，差距更大
      const animationDuration = minDuration + (maxDuration - minDuration) * Math.pow(depth, 5)
      return {
        left: Math.random() * 100,
        top: Math.random() * 100,
        animationDelay: minDelay + Math.random() * (maxDelay - minDelay),
        animationDuration,
        depth,
        size,
        trail,
        opacity,
        color,
      }
    })
    setMeteors(arr)
  }, [number, minDelay, maxDelay, minDuration, maxDuration])

  return (
    <div className={`pointer-events-none absolute inset-0 z-0 ${className}`} aria-hidden="true">
      {meteors.map((meteor, i) => (
        <span
          key={i}
          className={
            `animate-meteor pointer-events-none absolute rotate-[var(--angle)] rounded-full shadow-[0_0_0_1px_#ffffff10] ` +
            `${meteor.color}`
          }
          style={{
            left: `calc(${meteor.left}% )`,
            top: `calc(${meteor.top}% )`,
            width: `${meteor.size}px`,
            height: `${meteor.size}px`,
            opacity: meteor.opacity,
            animationDelay: `${meteor.animationDelay}s`,
            animationDuration: `${meteor.animationDuration}s`,
            ['--angle' as string]: `${angle}deg`,
            zIndex: Math.round(100 - meteor.depth * 100),
          }}
        >
          <div
            className="pointer-events-none absolute top-1/2 -z-10 h-px -translate-y-1/2 bg-gradient-to-r from-zinc-500 to-transparent dark:from-blue-200"
            style={{ width: `${meteor.trail}px` }}
          ></div>
        </span>
      ))}
      <style jsx>{`
        @keyframes meteor-meteor {
          0% {
            opacity: 0;
            transform: none;
          }
          5% {
            opacity: 1;
          }
          60% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateX(-800px);
          }
        }
        .animate-meteor {
          animation-name: meteor-meteor;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  )
}

export default Meteors
