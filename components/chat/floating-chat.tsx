'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion'
import { ChatLauncher } from './chat-launcher'
import { ChatPanel } from './chat-panel'
import { ChatTurnstile, type ChatTurnstileHandle } from './chat-turnstile'
import type { ChatApiMessage, ChatApiResponse, ChatMessage } from './chat-types'
import type { ChatRealtimeEvent } from '@/lib/chat/realtime-events'
import {
  acknowledgeClientMessage,
  acquireSendLock,
  getOrCreateClientMessageId,
  releaseSendLock,
} from '@/lib/chat/client-command'
import {
  applyConversationClosedBarrier,
  decideRealtimeCommandSync,
  decideRealtimeEvent,
  decideRealtimeSendSuccess,
  getAuthoritativeReconciliationRetryDelay,
  hasConversationIdentityChanged,
  isRealtimeGenerationCurrent,
  mergeRealtimeMessages,
} from '@/lib/chat/realtime-client'
import { useChatRealtime, type RealtimeBootstrapResult } from './use-chat-realtime'

const PANEL_ID = 'floating-chat-panel'

const initialMessages: ChatMessage[] = [
  {
    id: 'assistant-greeting',
    role: 'assistant',
    content: 'Drop me a message :)',
  },
]

function mapApiMessage(message: ChatApiMessage): ChatMessage {
  return {
    id: message.id,
    role: message.role === 'visitor' ? 'user' : 'assistant',
    content: message.content,
    createdAt: message.createdAt,
  }
}

async function getResponseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message || fallback
  } catch {
    return fallback
  }
}

class ChatBootstrapError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ChatBootstrapError'
  }
}

function loadConversationPage(
  cursor: string | null,
  expectedConversationId: string | null = null
): Promise<ChatApiResponse> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  if (expectedConversationId) params.set('conversationId', expectedConversationId)
  const query = params.toString()
  const url = query ? `/api/chat/conversation?${query}` : '/api/chat/conversation'

  return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => {
    if (!response.ok) {
      throw new ChatBootstrapError(
        response.status,
        await getResponseMessage(response, '留言读取失败，请稍后再试。')
      )
    }
    return (await response.json()) as ChatApiResponse
  })
}

const MAX_REFRESH_PAGES = 25

type ConversationGapResult = {
  body: ChatApiResponse
  messages: ChatMessage[]
  reachedOverlap: boolean
  exhausted: boolean
}

function uniqueMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>()
  const unique: ChatMessage[] = []
  for (const message of messages) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    unique.push(message)
  }
  return unique
}

async function fetchMessagesUntilOverlap(
  knownIds: Set<string>,
  expectedConversationId: string | null
): Promise<ConversationGapResult> {
  let cursor: string | null = null
  let combined: ChatMessage[] = []
  let firstBody: ChatApiResponse | null = null
  let reachedOverlap = false
  let exhausted = false

  for (let page = 0; page < MAX_REFRESH_PAGES; page += 1) {
    const body = await loadConversationPage(cursor, expectedConversationId)
    firstBody ??= body
    const fetched = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
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

  if (!firstBody) throw new Error('CHAT_REALTIME_RECOVERY_EMPTY')

  return {
    body: firstBody,
    messages: uniqueMessages(combined),
    reachedOverlap,
    exhausted,
  }
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [realtimeEnabled, setRealtimeEnabled] = useState(false)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const [scrollToLatestRequest, setScrollToLatestRequest] = useState(0)
  const [smoothScrollPending, setSmoothScrollPending] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const turnstileRef = useRef<ChatTurnstileHandle>(null)
  const sendInFlightRef = useRef(false)
  const pendingClientMessageIdRef = useRef<string | null>(null)
  const pendingMessageContentRef = useRef<string | null>(null)
  const historyRequestedRef = useRef(false)
  const historyLoadedRef = useRef(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const conversationIdRef = useRef(conversationId)
  conversationIdRef.current = conversationId
  const requestGenerationRef = useRef(0)
  const reconciliationPromiseRef = useRef<Promise<void> | null>(null)
  const authoritativeRetryRef = useRef<{ attempt: number; timer: number | null }>({
    attempt: 0,
    timer: null,
  })
  const reducedMotion = useReducedMotion() ?? false
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

  const applyConversationHistory = useCallback(
    (
      body: ChatApiResponse,
      history: ChatMessage[],
      generation?: number,
      merge = false
    ): boolean => {
      if (
        generation !== undefined &&
        !isRealtimeGenerationCurrent(generation, requestGenerationRef.current)
      ) {
        return false
      }

      const nextConversationId = body.conversation?.id ?? null
      if (hasConversationIdentityChanged(conversationIdRef.current, nextConversationId)) {
        reconciliationPromiseRef.current = null
        requestGenerationRef.current += 1
      }
      conversationIdRef.current = nextConversationId
      setConversationId(nextConversationId)
      setRealtimeEnabled(body.realtimeEnabled)
      if (merge) {
        setMessages((current) => mergeRealtimeMessages(current, history, initialMessages[0].id))
      } else {
        setMessages(mergeRealtimeMessages([initialMessages[0]], history, initialMessages[0].id))
      }
      setHistoryCursor(body.nextCursor ?? null)
      setHasMoreHistory(Boolean(body.hasMore && body.nextCursor))
      historyLoadedRef.current = true
      return true
    },
    []
  )

  const closeChat = useCallback(() => {
    setOpen(false)
  }, [])

  const openChat = useCallback(() => {
    setOpen(true)
  }, [])

  const requestScrollToLatest = useCallback(() => {
    setScrollToLatestRequest((request) => request + 1)
  }, [])

  const beginSmoothScrollTransaction = useCallback(() => {
    setSmoothScrollPending(true)
  }, [])

  const completeSmoothScrollTransaction = useCallback(() => {
    setSmoothScrollPending(false)
  }, [])

  useEffect(() => {
    if (!open) completeSmoothScrollTransaction()
  }, [completeSmoothScrollTransaction, open, smoothScrollPending])

  const loadMoreHistory = useCallback(async () => {
    const cursor = historyCursor
    if (!cursor || isLoadingMoreHistory) return
    const generation = requestGenerationRef.current
    const expectedConversationId = conversationIdRef.current

    setIsLoadingMoreHistory(true)
    try {
      const body = await loadConversationPage(cursor, expectedConversationId)
      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return

      const olderMessages = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
      if (hasConversationIdentityChanged(expectedConversationId, body.conversation?.id ?? null)) {
        const freshBody = await loadConversationPage(null)
        const freshHistory = Array.isArray(freshBody.messages)
          ? freshBody.messages.map(mapApiMessage)
          : []
        applyConversationHistory(freshBody, freshHistory, generation)
        return
      }
      setMessages((current) => mergeRealtimeMessages(current, olderMessages, initialMessages[0].id))
      setHistoryCursor(body.nextCursor ?? null)
      setHasMoreHistory(Boolean(body.hasMore && body.nextCursor))
    } catch (loadError) {
      let errorForDisplay: unknown = loadError
      if (loadError instanceof ChatBootstrapError && loadError.status === 409) {
        try {
          const body = await loadConversationPage(null)
          const history = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
          if (!applyConversationHistory(body, history, generation)) return
          setError(null)
          return
        } catch (refreshError) {
          errorForDisplay = refreshError
        }
      }
      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
      setError(
        errorForDisplay instanceof Error ? errorForDisplay.message : '留言读取失败，请稍后再试。'
      )
    } finally {
      setIsLoadingMoreHistory(false)
    }
  }, [applyConversationHistory, historyCursor, isLoadingMoreHistory])

  const reconcileRealtimeState = useCallback(async () => {
    if (reconciliationPromiseRef.current) return reconciliationPromiseRef.current

    const generation = requestGenerationRef.current
    const expectedConversationId = conversationIdRef.current
    const task = (async () => {
      let result: ConversationGapResult
      try {
        result = await fetchMessagesUntilOverlap(
          new Set(messagesRef.current.map((message) => message.id)),
          expectedConversationId
        )
      } catch (loadError) {
        if (!(loadError instanceof ChatBootstrapError && loadError.status === 409)) {
          throw loadError
        }

        const body = await loadConversationPage(null)
        const history = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
        applyConversationHistory(body, history, generation)
        return
      }

      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return

      const nextConversationId = result.body.conversation?.id ?? null
      if (hasConversationIdentityChanged(expectedConversationId, nextConversationId)) {
        applyConversationHistory(result.body, result.messages, generation)
        setError(null)
        return
      }

      if (!result.reachedOverlap && !result.exhausted) {
        setError('留言历史较多，暂时无法完成实时同步，请稍后再试。')
        throw new Error('CHAT_REALTIME_RECOVERY_INCOMPLETE')
      }

      setRealtimeEnabled(result.body.realtimeEnabled)
      setHistoryCursor(result.body.nextCursor ?? null)
      setHasMoreHistory(Boolean(result.body.hasMore && result.body.nextCursor))
      setMessages((current) =>
        mergeRealtimeMessages(current, result.messages, initialMessages[0].id)
      )
      setError(null)
    })()

    const trackedPromise = task.finally(() => {
      if (reconciliationPromiseRef.current === trackedPromise) {
        reconciliationPromiseRef.current = null
      }
    })
    reconciliationPromiseRef.current = trackedPromise
    return trackedPromise
  }, [applyConversationHistory])

  const resetAuthoritativeReconciliationRetry = useCallback(() => {
    const retryState = authoritativeRetryRef.current
    if (retryState.timer !== null) window.clearTimeout(retryState.timer)
    retryState.attempt = 0
    retryState.timer = null
  }, [])

  const scheduleAuthoritativeReconciliationRetry = useCallback(
    (sendSuccess: ReturnType<typeof decideRealtimeSendSuccess>): boolean => {
      const scheduleNext = (): boolean => {
        const retryState = authoritativeRetryRef.current
        if (retryState.timer !== null) return true

        const delay = getAuthoritativeReconciliationRetryDelay(retryState.attempt)
        if (delay === null) return false

        retryState.attempt += 1
        retryState.timer = window.setTimeout(() => {
          retryState.timer = null
          const retryGeneration = requestGenerationRef.current
          void reconcileRealtimeState()
            .then(() => {
              const syncDecision = decideRealtimeCommandSync(sendSuccess, 'succeeded')
              resetAuthoritativeReconciliationRetry()
              if (
                syncDecision.type === 'synchronized' &&
                isRealtimeGenerationCurrent(retryGeneration, requestGenerationRef.current)
              ) {
                requestScrollToLatest()
                setError(null)
              }
              if (
                syncDecision.type !== 'synchronized' ||
                !isRealtimeGenerationCurrent(retryGeneration, requestGenerationRef.current)
              ) {
                completeSmoothScrollTransaction()
              }
            })
            .catch(() => {
              const retryScheduled = scheduleNext()
              const syncDecision = decideRealtimeCommandSync(sendSuccess, 'failed', retryScheduled)
              if (
                isRealtimeGenerationCurrent(retryGeneration, requestGenerationRef.current) &&
                syncDecision.type !== 'synchronized'
              ) {
                setError(
                  syncDecision.type === 'retrying'
                    ? '留言已提交，但状态同步暂时失败，正在重试。'
                    : '留言已提交，但状态同步失败，请重新打开聊天重试。'
                )
              }
              if (!retryScheduled) completeSmoothScrollTransaction()
            })
        }, delay)
        return true
      }

      return scheduleNext()
    },
    [
      completeSmoothScrollTransaction,
      reconcileRealtimeState,
      requestScrollToLatest,
      resetAuthoritativeReconciliationRetry,
    ]
  )

  useEffect(() => {
    return () => resetAuthoritativeReconciliationRetry()
  }, [resetAuthoritativeReconciliationRetry])

  const recoverRealtimeGap = useCallback(() => reconcileRealtimeState(), [reconcileRealtimeState])

  const refreshRealtimeBootstrap = useCallback(async (): Promise<RealtimeBootstrapResult> => {
    const generation = requestGenerationRef.current
    try {
      let body: ChatApiResponse
      try {
        body = await loadConversationPage(null, conversationIdRef.current)
      } catch (loadError) {
        if (!(loadError instanceof ChatBootstrapError && loadError.status === 409)) throw loadError
        body = await loadConversationPage(null)
      }
      const history = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
      if (!applyConversationHistory(body, history, generation)) return 'stop'
      setError(null)

      return body.realtimeEnabled && Boolean(body.conversation) ? 'retry' : 'stop'
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '留言读取失败，请稍后再试。'
      setError(message)
      return loadError instanceof ChatBootstrapError && loadError.status === 401 ? 'stop' : 'retry'
    }
  }, [applyConversationHistory])

  const sendMessage = useCallback(async () => {
    const content = input.trim()
    if (!content) return

    if (!siteKey) {
      setError('验证服务尚未配置，暂时无法提交留言。')
      return
    }

    if (!acquireSendLock(sendInFlightRef)) return

    setError(null)
    setIsSending(true)
    const generation = requestGenerationRef.current
    const pendingClientMessage = {
      current: {
        id: pendingClientMessageIdRef.current,
        content: pendingMessageContentRef.current,
      },
    }
    const clientMessageId = getOrCreateClientMessageId(pendingClientMessage, content)
    pendingClientMessageIdRef.current = pendingClientMessage.current.id
    pendingMessageContentRef.current = pendingClientMessage.current.content

    try {
      const turnstileToken = await turnstileRef.current?.getToken()
      if (!turnstileToken) throw new Error('TURNSTILE_TOKEN_MISSING')

      const pageUrl = window.location.pathname + window.location.search
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, pageUrl, turnstileToken, clientMessageId }),
      })

      if (!response.ok) {
        throw new Error(await getResponseMessage(response, '留言提交失败，请稍后再试。'))
      }

      const body = (await response.json()) as {
        conversation: ChatApiResponse['conversation']
        message: ChatApiMessage
        realtimeEnabled?: boolean
      }
      acknowledgeClientMessage(pendingClientMessage)
      pendingClientMessageIdRef.current = pendingClientMessage.current.id
      pendingMessageContentRef.current = pendingClientMessage.current.content
      const successDecision = decideRealtimeSendSuccess(generation, requestGenerationRef.current)
      if (successDecision.commandCommitted && successDecision.inputAcknowledged) {
        setInput('')
      }
      if (successDecision.type === 'reconcile') {
        beginSmoothScrollTransaction()
        const reconciliationGeneration = requestGenerationRef.current
        try {
          await reconcileRealtimeState()
          const syncDecision = decideRealtimeCommandSync(successDecision, 'succeeded')
          resetAuthoritativeReconciliationRetry()
          if (syncDecision.type === 'synchronized') {
            if (
              isRealtimeGenerationCurrent(reconciliationGeneration, requestGenerationRef.current)
            ) {
              requestScrollToLatest()
              setError(null)
            } else {
              completeSmoothScrollTransaction()
            }
          }
        } catch {
          const retryScheduled = scheduleAuthoritativeReconciliationRetry(successDecision)
          const syncDecision = decideRealtimeCommandSync(successDecision, 'failed', retryScheduled)
          if (
            isRealtimeGenerationCurrent(reconciliationGeneration, requestGenerationRef.current) &&
            syncDecision.type !== 'synchronized'
          ) {
            setError(
              syncDecision.type === 'retrying'
                ? '留言已提交，但状态同步暂时失败，正在重试。'
                : '留言已提交，但状态同步失败，请重新打开聊天重试。'
            )
          }
          if (!retryScheduled) completeSmoothScrollTransaction()
        }
        return
      }

      const nextConversationId = body.conversation?.id ?? null
      const currentConversationId = conversationIdRef.current
      reconciliationPromiseRef.current = null
      requestGenerationRef.current += 1
      historyLoadedRef.current = true
      conversationIdRef.current = nextConversationId
      setConversationId(nextConversationId)
      setRealtimeEnabled(body.realtimeEnabled === true)
      const submittedMessage = mapApiMessage(body.message)
      beginSmoothScrollTransaction()
      requestScrollToLatest()
      if (nextConversationId !== currentConversationId) {
        setMessages(
          mergeRealtimeMessages([initialMessages[0]], [submittedMessage], initialMessages[0].id)
        )
        setHistoryCursor(null)
        setHasMoreHistory(false)
      } else {
        setMessages((current) =>
          mergeRealtimeMessages(current, [submittedMessage], initialMessages[0].id)
        )
      }
    } catch (submissionError) {
      if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
      setError(
        submissionError instanceof Error && submissionError.message !== 'TURNSTILE_TOKEN_MISSING'
          ? submissionError.message
          : '验证未完成，请稍后重试。'
      )
    } finally {
      turnstileRef.current?.reset()
      releaseSendLock(sendInFlightRef)
      setIsSending(false)
    }
  }, [
    input,
    beginSmoothScrollTransaction,
    completeSmoothScrollTransaction,
    reconcileRealtimeState,
    resetAuthoritativeReconciliationRetry,
    requestScrollToLatest,
    scheduleAuthoritativeReconciliationRetry,
    siteKey,
  ])

  const handleRealtimeEvent = useCallback(
    (event: ChatRealtimeEvent) => {
      const decision = decideRealtimeEvent(event, conversationIdRef.current)
      if (decision.type === 'ignore') return

      if (decision.type === 'conversation.closed') {
        const currentConversationId = conversationIdRef.current
        if (!currentConversationId) return

        const barrier = applyConversationClosedBarrier(
          {
            conversationId: currentConversationId,
            status: 'open',
            realtimeEnabled,
          },
          decision.conversationId
        )
        if (barrier.conversationId !== currentConversationId) return

        reconciliationPromiseRef.current = null
        requestGenerationRef.current += 1
        conversationIdRef.current = null
        setConversationId(null)
        setRealtimeEnabled(barrier.realtimeEnabled)
        setMessages(initialMessages)
        setHistoryCursor(null)
        setHasMoreHistory(false)
        historyLoadedRef.current = true
        setError(null)
        return
      }

      const incoming = mapApiMessage({
        id: decision.message.id,
        role: decision.message.role,
        content: decision.message.content,
        pageUrl: decision.message.pageUrl,
        createdAt: new Date(decision.message.createdAt).toISOString(),
      })
      setMessages((current) => mergeRealtimeMessages(current, [incoming], initialMessages[0].id))
    },
    [realtimeEnabled]
  )

  useChatRealtime({
    enabled: open && realtimeEnabled && Boolean(conversationId),
    path: conversationId
      ? `/api/chat/realtime?conversationId=${encodeURIComponent(conversationId)}`
      : '/api/chat/realtime',
    onEvent: handleRealtimeEvent,
    onReconnect: recoverRealtimeGap,
    onHandshakeFailure: refreshRealtimeBootstrap,
  })

  useEffect(() => {
    if (!open) return

    const generation = requestGenerationRef.current
    if (!historyRequestedRef.current) {
      historyRequestedRef.current = true
      historyLoadedRef.current = false
      void loadConversationPage(null)
        .then((body) => {
          const history = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
          if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return

          if (!applyConversationHistory(body, history, generation)) return
          setError(null)
        })
        .catch((loadError) => {
          if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
          historyRequestedRef.current = false
          historyLoadedRef.current = false
          conversationIdRef.current = null
          setConversationId(null)
          setError(loadError instanceof Error ? loadError.message : '留言读取失败，请稍后再试。')
        })

      return () => {
        requestGenerationRef.current += 1
        reconciliationPromiseRef.current = null
        if (!historyLoadedRef.current) historyRequestedRef.current = false
      }
    }

    // Reopened within the same page load: walk newest → older until we overlap
    // a locally known message so replies added while closed cannot leave a gap.
    void reconcileRealtimeState()
      .then(() => {
        if (isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) {
          setError(null)
        }
      })
      .catch((loadError) => {
        if (!isRealtimeGenerationCurrent(generation, requestGenerationRef.current)) return
        setError(loadError instanceof Error ? loadError.message : '留言读取失败，请稍后再试。')
      })

    return () => {
      requestGenerationRef.current += 1
      reconciliationPromiseRef.current = null
    }
  }, [applyConversationHistory, open, reconcileRealtimeState])

  useEffect(() => {
    if (!open || !conversationId || !realtimeEnabled) return

    const reconcile = () => {
      void reconcileRealtimeState().catch(() => undefined)
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
  }, [conversationId, open, realtimeEnabled, reconcileRealtimeState])

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeChat()
    }

    window.addEventListener('keydown', handleKeyDown)
    const focusTimer = window.setTimeout(
      () => {
        if (window.matchMedia('(min-width: 640px)').matches) {
          textareaRef.current?.focus()
        }
      },
      reducedMotion ? 80 : 150
    )

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.clearTimeout(focusTimer)
    }
  }, [closeChat, open, reducedMotion])

  useEffect(() => {
    if (open) return

    const focusTimer = window.setTimeout(
      () => {
        launcherRef.current?.focus()
      },
      reducedMotion ? 80 : 280
    )

    return () => window.clearTimeout(focusTimer)
  }, [open, reducedMotion])

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      <ChatTurnstile ref={turnstileRef} siteKey={siteKey} />
      <LayoutGroup id="floating-chat">
        <AnimatePresence initial={false}>
          {open ? (
            <ChatPanel
              key="chat-panel"
              messages={messages}
              hasMoreHistory={hasMoreHistory}
              isLoadingMoreHistory={isLoadingMoreHistory}
              input={input}
              panelId={PANEL_ID}
              textareaRef={textareaRef}
              onChange={setInput}
              onClose={closeChat}
              onLoadMoreHistory={loadMoreHistory}
              onSubmit={sendMessage}
              isSending={isSending}
              error={error}
              reducedMotion={reducedMotion}
              scrollToLatestRequest={scrollToLatestRequest}
              smoothScrollPending={smoothScrollPending}
              onSmoothScrollComplete={completeSmoothScrollTransaction}
            />
          ) : (
            <ChatLauncher
              key="chat-launcher"
              ref={launcherRef}
              open={open}
              panelId={PANEL_ID}
              onClick={openChat}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
