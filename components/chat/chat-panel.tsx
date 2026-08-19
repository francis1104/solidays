'use client'

import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { ChatComposer } from './chat-composer'
import { ChatHeader } from './chat-header'
import { ChatMessages } from './chat-messages'
import { ChatSurface } from './chat-surface'
import type { ChatMessage } from './chat-types'

type ChatPanelProps = {
  messages: ChatMessage[]
  hasMoreHistory: boolean
  isLoadingMoreHistory: boolean
  input: string
  panelId: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onChange: (value: string) => void
  onClose: () => void
  onLoadMoreHistory: () => void
  onSubmit: () => void
  isSending: boolean
  error: string | null
  reducedMotion: boolean
  scrollToLatestRequest: number
  smoothScrollPending: boolean
  onSmoothScrollComplete: () => void
  routeClosing?: boolean
  onRouteCloseComplete?: () => void
}

export function ChatPanel({
  messages,
  hasMoreHistory,
  isLoadingMoreHistory,
  input,
  panelId,
  textareaRef,
  onChange,
  onClose,
  onLoadMoreHistory,
  onSubmit,
  isSending,
  error,
  reducedMotion,
  scrollToLatestRequest,
  smoothScrollPending,
  onSmoothScrollComplete,
  routeClosing = false,
  onRouteCloseComplete,
}: ChatPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!routeClosing) return

    const panel = panelRef.current
    const activeElement = document.activeElement
    if (panel && activeElement instanceof HTMLElement && panel.contains(activeElement)) {
      activeElement.blur()
    }
  }, [routeClosing])

  return (
    <motion.div
      ref={panelRef}
      id={panelId}
      layoutId={routeClosing ? undefined : 'floating-chat-surface'}
      role="dialog"
      aria-modal="false"
      aria-labelledby="floating-chat-title"
      aria-hidden={routeClosing ? true : undefined}
      inert={routeClosing || undefined}
      data-testid="chat-panel"
      initial={false}
      animate={
        routeClosing
          ? { opacity: 0, scale: 0.12, borderRadius: 999 }
          : { opacity: 1, scale: 1, borderRadius: 24 }
      }
      transition={
        routeClosing
          ? { duration: reducedMotion ? 0.08 : 0.24, ease: 'easeInOut' }
          : reducedMotion
            ? { duration: 0.18 }
            : { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }
      }
      onAnimationComplete={routeClosing ? onRouteCloseComplete : undefined}
      style={{ pointerEvents: routeClosing ? 'none' : undefined, transformOrigin: 'bottom right' }}
      className="pointer-events-auto fixed right-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-[60] h-[min(72dvh,620px)] w-[calc(100vw-24px)] max-w-[420px] overflow-hidden rounded-[24px] outline-none sm:right-6 sm:bottom-6 sm:h-[560px] sm:w-[380px] sm:max-w-[380px]"
    >
      <ChatSurface className="flex h-full w-full flex-col rounded-[inherit]">
        <motion.div
          key="chat-content"
          initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
          transition={{
            duration: reducedMotion ? 0.12 : 0.2,
            delay: reducedMotion ? 0 : 0.09,
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <ChatHeader onClose={onClose} />
          <ChatMessages
            messages={messages}
            hasMore={hasMoreHistory}
            isLoadingMore={isLoadingMoreHistory}
            onLoadMore={onLoadMoreHistory}
            scrollToLatestRequest={scrollToLatestRequest}
            smoothScrollPending={smoothScrollPending}
            reducedMotion={reducedMotion}
            onSmoothScrollComplete={onSmoothScrollComplete}
          />
          <ChatComposer
            value={input}
            onChange={onChange}
            onSubmit={onSubmit}
            textareaRef={textareaRef}
            disabled={isSending}
            error={error}
          />
        </motion.div>
      </ChatSurface>
    </motion.div>
  )
}
