'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowUp } from 'lucide-react'
import { cn } from '@/components/lib/utils'
import {
  formatRelativeTime,
  type AdminConversationStatus,
  type AdminMessage,
  type AdminMessagesResponse,
  type AdminReplyResponse,
} from './admin-types'
import type { ChatRealtimeEvent } from '@/lib/chat/realtime-events'
import {
  applyConversationClosedBarrier,
  isRealtimeGenerationCurrent,
  mergeRealtimeMessages,
} from '@/lib/chat/realtime-client'
import { useChatRealtime, type RealtimeBootstrapResult } from '@/components/chat/use-chat-realtime'

type ConversationDetailProps = {
  conversationId: string
  onBack: () => void
  onSessionExpired: () => void
}

class AdminMessagesError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'AdminMessagesError'
  }
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
  if (!response.ok) throw new AdminMessagesError(response.status, '会话读取失败，请稍后再试。')
  return (await response.json()) as AdminMessagesResponse
}

const MAX_REFRESH_PAGES = 25

type AdminGapResult = {
  body: AdminMessagesResponse
  messages: AdminMessage[]
  reachedOverlap: boolean
  exhausted: boolean
}

async function fetchAdminMessagesUntilOverlap(
  conversationId: string,
  knownIds: Set<string>
): Promise<AdminGapResult> {
  let cursor: string | null = null
  let combined: AdminMessage[] = []
  let firstBody: AdminMessagesResponse | null = null
  let reachedOverlap = false
  let exhausted = false

  for (let page = 0; page < MAX_REFRESH_PAGES; page += 1) {
    const body = await loadAdminMessages(conversationId, cursor)
    firstBody ??= body
    const fetched = Array.isArray(body.messages) ? body.messages : []
    const hitKnown = fetched.some((message) => knownIds.has(message.id))
    combined = page === 0 ? fetched : [...fetched, ...combined]

    if (hitKnown) {
      reachedOverlap = true
      break
    }
    if (!body.hasMore || !body.nextCursor) {
      exhausted = true
      break
    }
    cursor = body.nextCursor
  }

  const seen = new Set<string>()
  const unique: AdminMessage[] = []
  for (const message of combined) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    unique.push(message)
  }
  if (!firstBody) throw new Error('CHAT_REALTIME_RECOVERY_EMPTY')

  return { body: firstBody, messages: unique, reachedOverlap, exhausted }
}

export function ConversationDetail({
  conversationId,
  onBack,
  onSessionExpired,
}: ConversationDetailProps) {
  const [messages, setMessages] = useState<AdminMessage[]>([])
  const [visitorLabel, setVisitorLabel] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [conversationStatus, setConversationStatus] = useState<AdminConversationStatus>('open')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeEnabled, setRealtimeEnabled] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickToBottomRef = useRef(true)
  const pendingScrollAdjustRef = useRef<number | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const requestGenerationRef = useRef(0)
  const reconciliationPromiseRef = useRef<Promise<void> | null>(null)
  const reducedMotion = useReducedMotion() ?? false

  const applyAdminSnapshot = useCallback(
    (body: AdminMessagesResponse, generation: number, merge = true): boolean => {
      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return false

      setMessages((current) =>
        merge
          ? mergeRealtimeMessages(current, body.messages)
          : mergeRealtimeMessages([], body.messages)
      )
      setHasMore(Boolean(body.hasMore && body.nextCursor))
      setNextCursor(body.nextCursor ?? null)
      setRealtimeEnabled(body.realtimeEnabled && body.conversation.status === 'open')
      setConversationStatus(body.conversation.status)
      setVisitorLabel(`访客 #${body.conversation.visitorId.slice(0, 8)}`)
      return true
    },
    []
  )

  useEffect(() => {
    reconciliationPromiseRef.current = null
    const generation = requestGenerationRef.current + 1
    requestGenerationRef.current = generation
    let cancelled = false
    setStatus('loading')
    setError(null)
    setHasMore(false)
    setNextCursor(null)
    setRealtimeEnabled(false)
    setConversationStatus('open')

    void loadAdminMessages(conversationId, null)
      .then((body) => {
        if (cancelled || !isRealtimeGenerationCurrent(generation, requestGenerationRef.current))
          return
        stickToBottomRef.current = true
        applyAdminSnapshot(body, generation, false)
        setStatus('ready')
      })
      .catch((loadError) => {
        if (
          cancelled ||
          !isRealtimeGenerationCurrent(generation, requestGenerationRef.current) ||
          (loadError instanceof Error && loadError.message === 'session expired')
        ) {
          if (
            !cancelled &&
            isRealtimeGenerationCurrent(generation, requestGenerationRef.current) &&
            loadError instanceof Error &&
            loadError.message === 'session expired'
          ) {
            onSessionExpired()
          }
          return
        }
        setStatus('error')
        setError(loadError instanceof Error ? loadError.message : '会话读取失败，请稍后再试。')
      })

    return () => {
      cancelled = true
      reconciliationPromiseRef.current = null
      requestGenerationRef.current += 1
    }
  }, [applyAdminSnapshot, conversationId, onSessionExpired])

  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return

    const previousHeight = pendingScrollAdjustRef.current
    if (previousHeight != null) {
      node.scrollTop += node.scrollHeight - previousHeight
      pendingScrollAdjustRef.current = null
      return
    }

    if (status !== 'ready' || !stickToBottomRef.current) return
    node.scrollTop = node.scrollHeight
  }, [messages, status])

  const loadOlderMessages = useCallback(async () => {
    const cursor = nextCursor
    if (!cursor || loadingMore) return
    const generation = requestGenerationRef.current

    setLoadingMore(true)
    setError(null)
    try {
      const body = await loadAdminMessages(conversationId, cursor)
      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
      stickToBottomRef.current = false
      pendingScrollAdjustRef.current = scrollRef.current?.scrollHeight ?? 0
      applyAdminSnapshot(body, generation)
    } catch (loadError) {
      pendingScrollAdjustRef.current = null
      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
      if (loadError instanceof Error && loadError.message === 'session expired') {
        onSessionExpired()
        return
      }
      setError(loadError instanceof Error ? loadError.message : '会话读取失败，请稍后再试。')
    } finally {
      setLoadingMore(false)
    }
  }, [applyAdminSnapshot, conversationId, loadingMore, nextCursor, onSessionExpired])

  const recoverRealtimeGap = useCallback(async () => {
    const generation = requestGenerationRef.current
    const knownIds = new Set(messagesRef.current.map((message) => message.id))
    const result = await fetchAdminMessagesUntilOverlap(conversationId, knownIds)
    if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
    if (!result.reachedOverlap && !result.exhausted) {
      setError('会话历史较多，暂时无法完成实时同步，请稍后再试。')
      throw new Error('CHAT_REALTIME_RECOVERY_INCOMPLETE')
    }
    applyAdminSnapshot(
      {
        ...result.body,
        messages: result.messages,
      },
      generation
    )
  }, [applyAdminSnapshot, conversationId])

  const refreshRealtimeBootstrap = useCallback(async (): Promise<RealtimeBootstrapResult> => {
    const generation = requestGenerationRef.current
    try {
      const body = await loadAdminMessages(conversationId, null)
      if (!applyAdminSnapshot(body, generation)) return 'stop'
      setError(null)

      return body.realtimeEnabled && body.conversation.status === 'open' ? 'retry' : 'stop'
    } catch (loadError) {
      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return 'stop'
      if (loadError instanceof Error && loadError.message === 'session expired') {
        onSessionExpired()
        return 'stop'
      }

      if (loadError instanceof AdminMessagesError && loadError.status === 404) {
        setRealtimeEnabled(false)
        setError(loadError.message)
        return 'stop'
      }

      setError(loadError instanceof Error ? loadError.message : '会话读取失败，请稍后再试。')
      return 'retry'
    }
  }, [applyAdminSnapshot, conversationId, onSessionExpired])

  const reconcileAdminState = useCallback(
    (force = false, expectedGeneration: number = requestGenerationRef.current): Promise<void> => {
      if (!force && reconciliationPromiseRef.current) {
        return reconciliationPromiseRef.current
      }

      const task = (async () => {
        try {
          const body = await loadAdminMessages(conversationId, null)
          if (!applyAdminSnapshot(body, expectedGeneration)) return
          setError(null)
        } catch (loadError) {
          if (!isRealtimeGenerationCurrent(expectedGeneration, requestGenerationRef.current)) return
          if (loadError instanceof Error && loadError.message === 'session expired') {
            onSessionExpired()
            return
          }
          setError(loadError instanceof Error ? loadError.message : '会话读取失败，请稍后再试。')
        }
      })()

      if (force) return task

      const trackedPromise = task.finally(() => {
        if (reconciliationPromiseRef.current === trackedPromise) {
          reconciliationPromiseRef.current = null
        }
      })
      reconciliationPromiseRef.current = trackedPromise
      return trackedPromise
    },
    [applyAdminSnapshot, conversationId, onSessionExpired]
  )

  const handleRealtimeEvent = useCallback(
    (event: ChatRealtimeEvent) => {
      if (event.conversationId !== conversationId) return
      if (event.type === 'conversation.closed') {
        const barrier = applyConversationClosedBarrier(
          {
            conversationId,
            status: conversationStatus,
            realtimeEnabled,
          },
          event.conversationId
        )
        if (barrier.conversationId !== conversationId) return

        reconciliationPromiseRef.current = null
        requestGenerationRef.current += 1
        const generation = requestGenerationRef.current
        setConversationStatus(barrier.status)
        setRealtimeEnabled(barrier.realtimeEnabled)
        setError(null)
        // The close event is a state barrier, but D1 remains authoritative:
        // a message committed immediately before close can be published after
        // the close event. Reconcile once before the socket is torn down.
        void reconcileAdminState(true, generation)
        return
      }

      const incoming: AdminMessage = {
        id: event.message.id,
        role: event.message.role,
        content: event.message.content,
        pageUrl: event.message.pageUrl,
        createdAt: new Date(event.message.createdAt).toISOString(),
      }
      setMessages((current) => mergeRealtimeMessages(current, [incoming]))
    },
    [conversationId, conversationStatus, realtimeEnabled, reconcileAdminState]
  )

  useChatRealtime({
    enabled: status === 'ready' && realtimeEnabled,
    path: `/api/admin/conversations/${conversationId}/realtime`,
    onEvent: handleRealtimeEvent,
    onReconnect: recoverRealtimeGap,
    onHandshakeFailure: refreshRealtimeBootstrap,
  })

  useEffect(() => {
    if (status !== 'ready' || conversationStatus !== 'open' || !realtimeEnabled) return

    const reconcile = () => {
      void reconcileAdminState().catch(() => undefined)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') reconcile()
    }

    window.addEventListener('online', reconcile)
    window.addEventListener('focus', reconcile)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const interval = window.setInterval(reconcile, 60_000)

    return () => {
      window.removeEventListener('online', reconcile)
      window.removeEventListener('focus', reconcile)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.clearInterval(interval)
    }
  }, [conversationStatus, realtimeEnabled, reconcileAdminState, status])

  const sendReply = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      const content = input.trim()
      if (!content || sending || conversationStatus === 'closed') return

      const generation = requestGenerationRef.current
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
          if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
          onSessionExpired()
          return
        }
        const body = (await response.json().catch(() => null)) as
          | (AdminReplyResponse & {
              realtimeEnabled?: boolean
              error?: { code?: string; message?: string }
            })
          | { error?: { code?: string; message?: string } }
          | null

        if (response.status === 409 || body?.error?.code === 'CONVERSATION_CLOSED') {
          if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return

          reconciliationPromiseRef.current = null
          requestGenerationRef.current += 1
          const closedGeneration = requestGenerationRef.current
          setConversationStatus('closed')
          setRealtimeEnabled(false)
          await reconcileAdminState(true, closedGeneration)
          if (isRealtimeGenerationCurrent(closedGeneration, requestGenerationRef.current)) {
            setError(body?.error?.message || '会话已关闭，无法回复。')
          }
          return
        }
        if (!response.ok) {
          throw new Error(body?.error?.message || '回复失败，请稍后再试。')
        }

        if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return

        if (!body || !('message' in body) || !('conversation' in body)) {
          throw new Error('回复响应无效，请稍后再试。')
        }

        reconciliationPromiseRef.current = null
        requestGenerationRef.current += 1
        stickToBottomRef.current = true
        setConversationStatus(body.conversation.status)
        setRealtimeEnabled(body.realtimeEnabled === true && body.conversation.status === 'open')
        setMessages((current) => mergeRealtimeMessages(current, [body.message]))
        setInput('')
      } catch (sendError) {
        setError(sendError instanceof Error ? sendError.message : '回复失败，请稍后再试。')
      } finally {
        setSending(false)
      }
    },
    [conversationId, conversationStatus, input, reconcileAdminState, sending, onSessionExpired]
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
          <p
            className={cn(
              'text-xs',
              conversationStatus === 'closed'
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-gray-400'
            )}
          >
            {conversationStatus === 'closed'
              ? '会话已结束'
              : hasMore
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
          disabled={sending || conversationStatus === 'closed'}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-gray-200/80 bg-white/70 px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
        />
        <button
          type="submit"
          aria-label="发送回复"
          disabled={!input.trim() || sending || conversationStatus === 'closed'}
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary flex size-10 shrink-0 items-center justify-center rounded-full transition-[opacity,transform] focus-visible:outline-2 active:scale-95 disabled:pointer-events-none disabled:opacity-35"
        >
          <ArrowUp className="size-4" strokeWidth={2.2} />
        </button>
      </form>
      {conversationStatus === 'closed' ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">会话已结束，无法继续回复。</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
