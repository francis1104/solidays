'use client'

import { useEffect, useRef } from 'react'
import { Message, MessageContent } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
} from '@/components/ui/message-scroller'
import type { ChatMessage } from './chat-types'

type ChatMessagesProps = {
  messages: ChatMessage[]
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  scrollToLatestRequest: number
}

function ChatMessagesContent({
  messages,
  hasMore,
  isLoadingMore,
  onLoadMore,
  scrollToLatestRequest,
}: ChatMessagesProps) {
  const { scrollToEnd } = useMessageScroller()
  const lastHandledScrollRequestRef = useRef(scrollToLatestRequest)

  useEffect(() => {
    if (lastHandledScrollRequestRef.current === scrollToLatestRequest) return

    lastHandledScrollRequestRef.current = scrollToLatestRequest
    scrollToEnd({ behavior: 'smooth' })
  }, [scrollToEnd, scrollToLatestRequest])

  return (
    <MessageScroller className="h-full">
      <MessageScrollerViewport aria-label="Messages">
        <MessageScrollerContent className="px-4 py-4">
          {hasMore ? (
            <div className="flex justify-center pb-3">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="focus-visible:outline-primary rounded-full border border-gray-200/70 bg-white/60 px-3 py-1 text-[11px] text-gray-500 transition-colors hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
              >
                {isLoadingMore ? '加载中…' : '加载更早留言'}
              </button>
            </div>
          ) : null}
          {messages.map((message) => {
            const isUser = message.role === 'user'

            return (
              <MessageScrollerItem key={message.id} messageId={message.id} className="w-full">
                <Message align={isUser ? 'end' : 'start'}>
                  <MessageContent className="w-full">
                    <Bubble align={isUser ? 'end' : 'start'} variant={isUser ? 'default' : 'ghost'}>
                      <BubbleContent
                        className={
                          isUser
                            ? 'rounded-2xl rounded-tr-md'
                            : 'rounded-2xl rounded-tl-md border-gray-200/60 bg-white/65 text-gray-800 dark:border-white/10 dark:bg-white/10 dark:text-gray-100'
                        }
                      >
                        {message.content}
                      </BubbleContent>
                    </Bubble>
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            )
          })}
        </MessageScrollerContent>
      </MessageScrollerViewport>
    </MessageScroller>
  )
}

export function ChatMessages(props: ChatMessagesProps) {
  return (
    <div className="relative min-h-0 flex-1">
      <MessageScrollerProvider autoScroll>
        <ChatMessagesContent {...props} />
      </MessageScrollerProvider>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/40 to-transparent dark:from-gray-950/35"
      />
    </div>
  )
}
