'use client'

import { motion } from 'framer-motion'
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
  onEndConversation: () => void
  onLoadMoreHistory: () => void
  onSubmit: () => void
  conversationStatus: 'open' | 'closed' | null
  isClosing: boolean
  isSending: boolean
  error: string | null
  reducedMotion: boolean
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
  onEndConversation,
  onLoadMoreHistory,
  onSubmit,
  conversationStatus,
  isClosing,
  isSending,
  error,
  reducedMotion,
}: ChatPanelProps) {
  return (
    <motion.div
      id={panelId}
      layoutId="floating-chat-surface"
      role="dialog"
      aria-modal="false"
      aria-labelledby="floating-chat-title"
      data-testid="chat-panel"
      initial={false}
      transition={
        reducedMotion
          ? { duration: 0.18 }
          : { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }
      }
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
          <ChatHeader
            onClose={onClose}
            onEndConversation={onEndConversation}
            conversationStatus={conversationStatus}
            isClosing={isClosing}
          />
          <ChatMessages
            messages={messages}
            hasMore={hasMoreHistory}
            isLoadingMore={isLoadingMoreHistory}
            onLoadMore={onLoadMoreHistory}
          />
          <ChatComposer
            value={input}
            onChange={onChange}
            onSubmit={onSubmit}
            textareaRef={textareaRef}
            disabled={isSending || isClosing}
            error={error}
          />
        </motion.div>
      </ChatSurface>
    </motion.div>
  )
}
