'use client'

import { cn } from '@/components/lib/utils'
import { motion, useMotionValue, useSpring, useTransform, MotionValue } from 'framer-motion'
import React, { PropsWithChildren, useRef } from 'react'

export interface DockProps extends PropsWithChildren {
  className?: string
  magnification?: number
  distance?: number
  direction?: 'top' | 'middle' | 'bottom'
}

const DEFAULT_MAGNIFICATION = 60
const DEFAULT_DISTANCE = 140

export function Dock({
  className,
  children,
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
}: DockProps) {
  const mouseX = useMotionValue(Infinity)

  const renderChildren = () => {
    return React.Children.map(children, (child: React.ReactElement<DockIconProps>) => {
      // 只对DockIcon组件传递mouseX等属性
      if (
        React.isValidElement(child) &&
        (child.type === DockIcon ||
          (child.type as React.ComponentType<DockIconProps>)?.displayName === 'DockIcon')
      ) {
        return React.cloneElement(child, {
          mouseX: mouseX,
          magnification: magnification,
          distance: distance,
        } as Partial<DockIconProps>)
      }
      // 对其他组件（如Separator）直接返回，不传递mouseX属性
      return child
    })
  }

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        'mx-auto flex h-12 items-center gap-0 rounded-2xl border px-2 py-2',
        'supports-backdrop-blur:bg-white/10 supports-backdrop-blur:dark:bg-black/10',
        'backdrop-blur-md',
        className
      )}
    >
      {renderChildren()}
    </motion.div>
  )
}

export interface DockIconProps {
  size?: number
  magnification?: number
  distance?: number
  mouseX?: MotionValue<number>
  className?: string
  children?: React.ReactNode
  onClick?: () => void
}

export function DockIcon({
  magnification = DEFAULT_MAGNIFICATION,
  distance = DEFAULT_DISTANCE,
  mouseX,
  className,
  children,
  onClick,
}: DockIconProps) {
  const ref = useRef<HTMLDivElement>(null)
  const defaultMouseX = useMotionValue(Infinity)

  const distanceCalc = useTransform(mouseX || defaultMouseX, (val: number) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 }
    return val - bounds.x - bounds.width / 2
  })

  const widthSync = useTransform(
    distanceCalc,
    [-distance, 0, distance],
    [32, magnification * 0.8, 32]
  )

  const width = useSpring(widthSync, {
    mass: 0.1,
    stiffness: 150,
    damping: 12,
  })

  return (
    <motion.div
      ref={ref}
      style={{ width }}
      className={cn(
        'flex aspect-square cursor-pointer items-center justify-center rounded-full',
        className
      )}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

DockIcon.displayName = 'DockIcon'
