'use client'

import { Moon, SunDim } from 'lucide-react'
import { useState, useRef } from 'react'
import { flushSync } from 'react-dom'
import { cn } from '@/components/lib/utils'

type props = {
  className?: string
}

export const AnimatedThemeToggler = ({ className }: props) => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const changeTheme = async () => {
    if (!buttonRef.current) return

    const root = document.documentElement
    root.classList.add('theme-transitioning')

    try {
      const transition = document.startViewTransition(() => {
        flushSync(() => {
          const dark = root.classList.toggle('dark')
          setIsDarkMode(dark)
        })
      })

      await transition.ready

      const { top, left, width, height } = buttonRef.current.getBoundingClientRect()
      const y = top + height / 2
      const x = left + width / 2

      const right = window.innerWidth - left
      const bottom = window.innerHeight - top
      const maxRad = Math.hypot(Math.max(left, right), Math.max(top, bottom))

      const reveal = root.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRad}px at ${x}px ${y}px)`],
        },
        {
          duration: 700,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        }
      )

      await Promise.allSettled([reveal.finished, transition.finished])
    } finally {
      root.classList.remove('theme-transitioning')
    }
  }
  return (
    <button ref={buttonRef} onClick={changeTheme} className={cn(className)}>
      {isDarkMode ? <SunDim /> : <Moon />}
    </button>
  )
}
