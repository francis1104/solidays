'use client'

import { forwardRef } from 'react'
import { MessageCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/components/lib/utils'

type ChatLauncherProps = {
  open: boolean
  onClick: () => void
  panelId: string
}

export const ChatLauncher = forwardRef<HTMLButtonElement, ChatLauncherProps>(function ChatLauncher(
  { open, onClick, panelId },
  ref
) {
  return (
    <motion.button
      ref={ref}
      type="button"
      layoutId="floating-chat-surface"
      aria-label="Open chat"
      aria-controls={panelId}
      aria-expanded={open}
      data-testid="chat-launcher"
      data-chat-surface
      title="Open chat"
      className={cn(
        'floating-control-surface floating-control-focus pointer-events-auto fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom))] z-[60] flex size-11 items-center justify-center rounded-full sm:right-6 sm:bottom-6 sm:size-12'
      )}
      style={{ borderRadius: 9999 }}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      onClick={onClick}
    >
      <MessageCircle className="size-4 sm:size-[18px]" strokeWidth={1.8} />
      <span
        aria-hidden="true"
        className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-white/70 dark:ring-gray-950/70"
      />
    </motion.button>
  )
})
