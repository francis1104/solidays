'use client'
import { cn } from '@/components/lib/utils'
import React, { useRef, useState, useEffect } from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  useVelocity,
  useAnimationControls,
} from 'framer-motion'

type DragConstraints = {
  top: number
  left: number
  right: number
  bottom: number
}

export const DraggableCardBody = ({
  className,
  children,
  constraintsRef,
}: {
  className?: string
  children?: React.ReactNode
  constraintsRef?: React.RefObject<HTMLElement | null>
}) => {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const controls = useAnimationControls()
  const [constraints, setConstraints] = useState<DragConstraints>({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  })
  const [measuredConstraints, setMeasuredConstraints] = useState<DragConstraints | null>(null)

  // physics biatch
  const velocityX = useVelocity(mouseX)
  const velocityY = useVelocity(mouseY)

  const springConfig = {
    stiffness: 100,
    damping: 20,
    mass: 0.5,
  }

  const rotateX = useSpring(useTransform(mouseY, [-300, 300], [25, -25]), springConfig)
  const rotateY = useSpring(useTransform(mouseX, [-300, 300], [-25, 25]), springConfig)

  const opacity = useSpring(useTransform(mouseX, [-300, 0, 300], [0.8, 1, 0.8]), springConfig)

  const glareOpacity = useSpring(useTransform(mouseX, [-300, 0, 300], [0.2, 0, 0.2]), springConfig)

  useEffect(() => {
    if (!constraintsRef) {
      setMeasuredConstraints(null)
      return
    }

    const updateConstraints = () => {
      const card = cardRef.current
      const constraintsElement = constraintsRef.current
      const offsetParent = card?.offsetParent

      if (!card || !constraintsElement || !offsetParent) return

      const parentRect = offsetParent.getBoundingClientRect()
      const constraintsRect = constraintsElement.getBoundingClientRect()
      const nextConstraints = {
        left: constraintsRect.left - parentRect.left - card.offsetLeft,
        right: constraintsRect.right - parentRect.left - (card.offsetLeft + card.offsetWidth),
        top: constraintsRect.top - parentRect.top - card.offsetTop,
        bottom: constraintsRect.bottom - parentRect.top - (card.offsetTop + card.offsetHeight),
      }

      setMeasuredConstraints((previous) => {
        if (
          previous &&
          previous.left === nextConstraints.left &&
          previous.right === nextConstraints.right &&
          previous.top === nextConstraints.top &&
          previous.bottom === nextConstraints.bottom
        ) {
          return previous
        }

        return nextConstraints
      })
    }

    updateConstraints()

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateConstraints) : null
    resizeObserver?.observe(constraintsRef.current ?? document.body)
    resizeObserver?.observe(cardRef.current ?? document.body)
    window.addEventListener('resize', updateConstraints)
    window.visualViewport?.addEventListener('resize', updateConstraints)

    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateConstraints)
      window.visualViewport?.removeEventListener('resize', updateConstraints)
    }
  }, [constraintsRef])

  useEffect(() => {
    if (constraintsRef) return

    // Update constraints when component mounts or window resizes
    const updateConstraints = () => {
      if (typeof window !== 'undefined') {
        setConstraints({
          top: -window.innerHeight / 2,
          left: -window.innerWidth / 2,
          right: window.innerWidth / 2,
          bottom: window.innerHeight / 2,
        })
      }
    }

    updateConstraints()

    // Add resize listener
    window.addEventListener('resize', updateConstraints)

    // Clean up
    return () => {
      window.removeEventListener('resize', updateConstraints)
    }
  }, [constraintsRef])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e
    const { width, height, left, top } = cardRef.current?.getBoundingClientRect() ?? {
      width: 0,
      height: 0,
      left: 0,
      top: 0,
    }
    const centerX = left + width / 2
    const centerY = top + height / 2
    const deltaX = clientX - centerX
    const deltaY = clientY - centerY
    mouseX.set(deltaX)
    mouseY.set(deltaY)
  }

  const handleMouseLeave = () => {
    mouseX.set(0)
    mouseY.set(0)
  }

  return (
    <motion.div
      ref={cardRef}
      drag
      dragConstraints={constraintsRef ? (measuredConstraints ?? constraintsRef) : constraints}
      onDragStart={() => {
        document.body.style.cursor = 'grabbing'
      }}
      onDragEnd={(event, info) => {
        document.body.style.cursor = 'default'

        controls.start({
          rotateX: 0,
          rotateY: 0,
          transition: {
            type: 'spring',
            ...springConfig,
          },
        })
        const currentVelocityX = velocityX.get()
        const currentVelocityY = velocityY.get()

        const velocityMagnitude = Math.sqrt(
          currentVelocityX * currentVelocityX + currentVelocityY * currentVelocityY
        )
        const bounce = Math.min(0.8, velocityMagnitude / 1000)

        animate(info.point.x, info.point.x + currentVelocityX * 0.3, {
          duration: 0.8,
          ease: [0.2, 0, 0, 1],
          bounce,
          type: 'spring',
          stiffness: 50,
          damping: 15,
          mass: 0.8,
        })

        animate(info.point.y, info.point.y + currentVelocityY * 0.3, {
          duration: 0.8,
          ease: [0.2, 0, 0, 1],
          bounce,
          type: 'spring',
          stiffness: 50,
          damping: 15,
          mass: 0.8,
        })
      }}
      style={{
        rotateX,
        rotateY,
        opacity,
        willChange: 'transform',
      }}
      animate={controls}
      whileHover={{ scale: 1.02 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'relative min-h-96 w-80 overflow-hidden rounded-md bg-neutral-100 p-6 shadow-2xl transform-3d dark:bg-neutral-900',
        className
      )}
    >
      {children}
      <motion.div
        style={{
          opacity: glareOpacity,
        }}
        className="pointer-events-none absolute inset-0 bg-white select-none"
      />
    </motion.div>
  )
}

export const DraggableCardContainer = React.forwardRef<
  HTMLDivElement,
  {
    className?: string
    children?: React.ReactNode
  }
>(({ className, children }, ref) => {
  return (
    <div ref={ref} className={cn('[perspective:3000px]', className)}>
      {children}
    </div>
  )
})

DraggableCardContainer.displayName = 'DraggableCardContainer'
