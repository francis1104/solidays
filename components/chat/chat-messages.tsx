'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
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
  smoothScrollPending: boolean
  reducedMotion: boolean
  onSmoothScrollComplete: () => void
}

type ChatMessagesContentProps = ChatMessagesProps & {
  scrollRequestPending: boolean
  onScrollRequestSettled: (request: number) => void
}

function ChatMessagesContent({
  messages,
  hasMore,
  isLoadingMore,
  onLoadMore,
  scrollToLatestRequest,
  reducedMotion,
  onSmoothScrollComplete,
  smoothScrollPending,
  scrollRequestPending,
  onScrollRequestSettled,
}: ChatMessagesContentProps) {
  const { scrollToEnd } = useMessageScroller()
  const viewportRef = useRef<HTMLDivElement>(null)
  const restoreFollowRef = useRef(false)

  useLayoutEffect(() => {
    if (!scrollRequestPending) return

    const request = scrollToLatestRequest
    const viewport = viewportRef.current
    let completed = false

    const isAtEnd = () => {
      if (!viewport) return true
      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      return maxScrollTop - viewport.scrollTop <= 1
    }

    const complete = () => {
      if (completed) return
      completed = true
      viewport?.removeEventListener('scroll', handleScroll)
      viewport?.removeEventListener('scrollend', complete)
      restoreFollowRef.current = true
      onScrollRequestSettled(request)
      onSmoothScrollComplete()
    }

    const handleScroll = () => {
      if (isAtEnd()) complete()
    }

    if (!viewport) {
      complete()
      return
    }

    viewport.addEventListener('scroll', handleScroll, { passive: true })
    viewport.addEventListener('scrollend', complete)
    const didScroll = scrollToEnd({ behavior: reducedMotion ? 'auto' : 'smooth' })

    if (!didScroll || isAtEnd()) complete()

    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      viewport.removeEventListener('scrollend', complete)
    }
  }, [
    onSmoothScrollComplete,
    onScrollRequestSettled,
    reducedMotion,
    scrollRequestPending,
    scrollToEnd,
    scrollToLatestRequest,
  ])

  useLayoutEffect(() => {
    if (smoothScrollPending || scrollRequestPending || !restoreFollowRef.current) return

    restoreFollowRef.current = false
    scrollToEnd({ behavior: 'auto' })
  }, [scrollRequestPending, scrollToEnd, smoothScrollPending])

  return (
    <MessageScroller className="h-full">
      <MessageScrollerViewport ref={viewportRef} aria-label="Messages">
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
  const [settledScrollRequest, setSettledScrollRequest] = useState(props.scrollToLatestRequest)
  const scrollRequestPending = settledScrollRequest !== props.scrollToLatestRequest
  const onScrollRequestSettled = useCallback((request: number) => {
    setSettledScrollRequest(request)
  }, [])

  return (
    <div className="relative min-h-0 flex-1">
      <MessageScrollerProvider autoScroll={!props.smoothScrollPending && !scrollRequestPending}>
        <ChatMessagesContent
          {...props}
          scrollRequestPending={scrollRequestPending}
          onScrollRequestSettled={onScrollRequestSettled}
        />
      </MessageScrollerProvider>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white/40 to-transparent dark:from-gray-950/35"
      />
    </div>
  )
}
