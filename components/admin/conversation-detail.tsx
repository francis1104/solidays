'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowUp } from 'lucide-react'
import { cn } from '@/components/lib/utils'
import {
  formatRelativeTime,
  type AdminMessage,
  type AdminMessagesResponse,
  type AdminReplyResponse,
} from './admin-types'

type ConversationDetailProps = {
  conversationId: string
  onBack: () => void
  onSessionExpired: () => void
}

async function loadAdminMessages(
  conversationId: string,
  cursor: string | null
): Promise<AdminMessagesResponse> {
  const url = cursor
    ? `/api/admin/conversations/${conversationId}/messages?cursor=${encodeURIComponent(cursor)}`
    : `/api/admin/conversations/${conversationId}/messages`
  const response = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  if (response.status === 401) throw new Error('session expired')
  if (!response.ok) throw new Error('会话读取失败，请稍后再试。')
  return (await response.json()) as AdminMessagesResponse
}

export function ConversationDetail({
  conversationId,
  onBack,
  onSessionExpired,
}: ConversationDetailProps) {
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [visitorLabel, setVisitorLabel] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  const pendingScrollAdjustRef = useRef<number | null>(null)
  const reducedMotion = useReducedMotion() ?? false

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)
    setHasMore(false)
    setNextCursor(null)

    void loadAdminMessages(conversationId, null)
      .then((body) => {
        if (cancelled) return
        stickToBottomRef.current = true
        setMessages(body.messages)
        setHasMore(Boolean(body.hasMore && body.nextCursor))
        setNextCursor(body.nextCursor ?? null)
        setVisitorLabel(`访客 #${body.conversation.visitorId.slice(0, 8)}`)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (cancelled || (loadError instanceof Error && loadError.message === 'session expired')) {
          if (!cancelled && loadError instanceof Error && loadError.message === 'session expired') {
            onSessionExpired()
          }
          return
        }
        setStatus('error')
        setError(loadError instanceof Error ? loadError.message : '会话读取失败，请稍后再试。')
      })

    return () => {
      cancelled = true
    }
  }, [conversationId, onSessionExpired])

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return

    const previousHeight = pendingScrollAdjustRef.current
    if (previousHeight != null) {
      node.scrollTop += node.scrollHeight - previousHeight
      pendingScrollAdjustRef.current = null
      return
    }

    if (status !== 'ready' || reducedMotion || !stickToBottomRef.current) return
    node.scrollTop = node.scrollHeight
  }, [messages, status, reducedMotion])

  const loadOlderMessages = useCallback(async () => {
    const cursor = nextCursor
    if (!cursor || loadingMore) return

    setLoadingMore(true)
    setError(null)
    try {
      const body = await loadAdminMessages(conversationId, cursor)
      stickToBottomRef.current = false
      pendingScrollAdjustRef.current = scrollRef.current?.scrollHeight ?? 0
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id))
        const older = body.messages.filter((message) => !known.has(message.id))
        return [...older, ...current]
      })
      setHasMore(Boolean(body.hasMore && body.nextCursor))
      setNextCursor(body.nextCursor ?? null)
    } catch (loadError) {
      pendingScrollAdjustRef.current = null
      if (loadError instanceof Error && loadError.message === 'session expired') {
        onSessionExpired()
        return
      }
      setError(loadError instanceof Error ? loadError.message : '会话读取失败，请稍后再试。')
    } finally {
      setLoadingMore(false)
    }
  }, [conversationId, loadingMore, nextCursor, onSessionExpired])

  const sendReply = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const content = input.trim()
      if (!content || sending) return

      setSending(true)
      setError(null)
      try {
        const response = await fetch(`/api/admin/conversations/${conversationId}/messages`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        if (response.status === 401) {
          onSessionExpired()
          return
        }
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string }
          } | null
          throw new Error(body?.error?.message || '回复失败，请稍后再试。')
        }

        const body = (await response.json()) as AdminReplyResponse
        stickToBottomRef.current = true
        setMessages((current) => {
          if (current.some((message) => message.id === body.message.id)) return current
          return [...current, body.message]
        })
        setInput('')
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : '回复失败，请稍后再试。')
      } finally {
        setSending(false)
      }
    },
    [conversationId, input, sending, onSessionExpired]
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回会话列表"
          className="text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{visitorLabel}</p>
          <p className="text-xs text-gray-400">
            {hasMore
              ? `已加载 ${messages.length} 条，还有更早消息`
              : `已加载 ${messages.length} 条`}
          </p>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-[52vh] min-h-64 flex-col gap-2.5 overflow-y-auto rounded-2xl border border-gray-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"
      >
        {status === 'loading' ? (
          <p className="py-8 text-center text-sm text-gray-400">加载中…</p>
        ) : status === 'error' ? (
          <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">
            {error ?? '会话读取失败。'}
          </p>
        ) : messages.length === 0 && !hasMore ? (
          <p className="py-8 text-center text-sm text-gray-400">（无留言）</p>
        ) : (
          <>
            {hasMore ? (
              <div className="flex justify-center pb-1">
                <button
                  type="button"
                  onClick={() => void loadOlderMessages()}
                  disabled={loadingMore}
                  className="rounded-full border border-gray-200/70 bg-white/60 px-3 py-1 text-[11px] text-gray-500 transition-colors hover:bg-white/90 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10"
                >
                  {loadingMore ? '加载中…' : '加载更早消息'}
                </button>
              </div>
            ) : null}
            {messages.map((message) => (
              <motion.div
                key={message.id}
                initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                  message.role === 'owner'
                    ? 'self-end rounded-br-sm bg-[#FBF050]/90 text-gray-900'
                    : message.role === 'system'
                      ? 'self-center text-center text-xs text-gray-400'
                      : 'self-start rounded-bl-sm bg-gray-900/5 text-gray-800 dark:bg-white/10 dark:text-gray-100'
                )}
              >
                {message.content}
                <span
                  className={cn(
                    'mt-1 block text-[10px]',
                    message.role === 'owner' ? 'text-gray-700/60' : 'text-gray-400'
                  )}
                >
                  {formatRelativeTime(message.createdAt)}
                </span>
              </motion.div>
            ))}
          </>
        )}
      </div>

      <form onSubmit={sendReply} className="flex items-end gap-2">
        <textarea
          rows={1}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            void sendReply(event)
          }}
          aria-label="回复内容"
          placeholder="回复访客…"
          disabled={sending}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
        />
        <button
          type="submit"
          aria-label="发送回复"
          disabled={!input.trim() || sending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary flex size-10 shrink-0 items-center justify-center rounded-full transition-[opacity,transform] focus-visible:outline-2 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <ArrowUp className="size-4" strokeWidth={2.2} />
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
