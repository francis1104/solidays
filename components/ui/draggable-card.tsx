'use client'
import React, { useRef } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'

export function DraggableCardContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}

export function DraggableCardBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotate = useTransform(x, [-300, 300], [-30, 30])
  const cardRef = useRef<HTMLDivElement>(null)

  // 天平效果：根据鼠标在卡片上的位置动态倾斜
  const [hoverRotate, setHoverRotate] = React.useState<{ x: number; y: number; opacity: number }>({
    x: 0,
    y: 0,
    opacity: 1,
  })

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement, MouseEvent>) {
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // 计算相对中心的偏移比例，范围[-1, 1]
    const normalizedX = (x - rect.width / 2) / (rect.width / 2)
    const normalizedY = (y - rect.height / 2) / (rect.height / 2)

    // 最大倾斜角度，调小一些让效果更柔和
    const maxTilt = 15

    // 让 hover 的方向下沉：X轴控制左右倾斜，Y轴控制上下倾斜
    const rotateY = normalizedX * maxTilt // 鼠标在右边时，右边下沉（正值）
    const rotateX = -normalizedY * maxTilt // 鼠标在下边时，下边下沉（负值）

    // 根据距离中心的程度调整透明度，越边缘越透明
    const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY)
    const opacity = Math.max(0.95, 1 - distance * 0.05) // 最低0.95，最高1

    setHoverRotate({ x: rotateX, y: rotateY, opacity })
  }

  function handleMouseLeave() {
    setHoverRotate({ x: 0, y: 0, opacity: 1 })
  }

  return (
    <motion.div
      ref={cardRef}
      drag
      style={{ x, y, rotate }}
      dragConstraints={{ left: -1000, right: 1000, top: -1000, bottom: 1000 }}
      dragElastic={0.18}
      whileHover={{
        scale: 1.05,
        opacity: hoverRotate.opacity,
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        rotateX: hoverRotate.x,
        rotateY: hoverRotate.y,
      }}
      transition={{
        type: 'spring',
        stiffness: 150,
        damping: 30,
        rotateX: { type: 'spring', stiffness: 80, damping: 20 },
        rotateY: { type: 'spring', stiffness: 80, damping: 20 },
        opacity: { type: 'spring', stiffness: 200, damping: 35 },
        scale: { type: 'spring', stiffness: 180, damping: 25 },
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`flex h-[400px] w-80 cursor-grab flex-col items-center justify-center rounded-xl bg-gray-100 p-4 shadow-2xl select-none dark:bg-gray-900 ${className}`}
    >
      {children}
    </motion.div>
  )
}
