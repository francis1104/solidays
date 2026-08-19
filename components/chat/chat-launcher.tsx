'use client'

import { forwardRef } from 'react'
import { MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/components/lib/utils'
import { chatSurfaceClassName } from './chat-surface'

type ChatLauncherProps = {
  open: boolean
  onClick: () => void
  panelId: string
  layoutId?: string
}

export const chatLauncherLayoutClassName =
  'fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] size-[52px] sm:right-6 sm:bottom-6 sm:size-14'

export const ChatLauncher = forwardRef<HTMLButtonElement, ChatLauncherProps>(function ChatLauncher(
  { open, onClick, panelId, layoutId },
  ref
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      layoutId={layoutId}
      aria-label="Open chat"
      aria-controls={panelId}
      aria-expanded={open}
      data-testid="chat-launcher"
      data-chat-surface
      title="Open chat"
      style={{ borderRadius: 9999 }}
      className={cn(
        chatSurfaceClassName,
        chatLauncherLayoutClassName,
        'hover:shadow-primary-500/20 pointer-events-auto z-[60] flex items-center justify-center rounded-full transition-[box-shadow] duration-300 outline-none hover:shadow-xl'
      )}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      onClick={onClick}
    >
      <MessageCircle className="size-5 sm:size-6" strokeWidth={1.8} />
      <span
        aria-hidden="true"
        className="absolute top-2 right-2 size-2 rounded-full bg-emerald-500 ring-2 ring-white/70 dark:ring-gray-950/70"
      />
    </motion.button>
  )
})
