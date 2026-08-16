'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, useReducedMotion } from 'framer-motion'
import { ChatLauncher } from './chat-launcher'
import { ChatPanel } from './chat-panel'
import { ChatTurnstile, type ChatTurnstileHandle } from './chat-turnstile'
import type { ChatApiMessage, ChatApiResponse, ChatMessage } from './chat-types'

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

function loadConversationPage(cursor: string | null): Promise<ChatApiResponse> {
  const url = cursor
    ? '/api/chat/conversation?cursor=' + encodeURIComponent(cursor)
    : '/api/chat/conversation'

  return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(async (response) => {
    if (!response.ok) {
      throw new Error(await getResponseMessage(response, '留言读取失败，请稍后再试。'))
    }
    return (await response.json()) as ChatApiResponse
  })
}

const MAX_REFRESH_PAGES = 25

async function fetchMessagesUntilOverlap(knownIds: Set<string>): Promise<ChatMessage[]> {
  let cursor: string | null = null
  let combined: ChatMessage[] = []

  for (let page = 0; page < MAX_REFRESH_PAGES; page += 1) {
    const body = await loadConversationPage(cursor)
    const fetched = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
    const hitKnown = fetched.some((message) => knownIds.has(message.id))
    combined = page === 0 ? fetched : [...fetched, ...combined]

    if (hitKnown || !body.hasMore || !body.nextCursor) break
    cursor = body.nextCursor
  }

  const seen = new Set<string>()
  const unique: ChatMessage[] = []
  for (const message of combined) {
    if (seen.has(message.id)) continue
    seen.add(message.id)
    unique.push(message)
  }
  return unique
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const turnstileRef = useRef<ChatTurnstileHandle>(null)
  const historyRequestedRef = useRef(false)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const reducedMotion = useReducedMotion() ?? false
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

  const closeChat = useCallback(() => {
    setOpen(false)
  }, [])

  const sendMessage = useCallback(async () => {
    const content = input.trim()
    if (!content || isSending) return

    if (!siteKey) {
      setError('验证服务尚未配置，暂时无法提交留言。')
      return
    }

    setError(null)
    setIsSending(true)

    try {
      const turnstileToken = await turnstileRef.current?.getToken()
      if (!turnstileToken) throw new Error('TURNSTILE_TOKEN_MISSING')

      const pageUrl = window.location.pathname + window.location.search
      const response = await fetch('/api/chat/messages', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, pageUrl, turnstileToken }),
      })

      if (!response.ok) {
        throw new Error(await getResponseMessage(response, '留言提交失败，请稍后再试。'))
      }

      const body = (await response.json()) as {
        conversation: ChatApiResponse['conversation']
        message: ChatApiMessage
      }
      setMessages((current) => [...current, mapApiMessage(body.message)])
      setInput('')
    } catch (submissionError) {
      setError(
        submissionError instanceof Error && submissionError.message !== 'TURNSTILE_TOKEN_MISSING'
          ? submissionError.message
          : '验证未完成，请稍后重试。'
      )
    } finally {
      turnstileRef.current?.reset()
      setIsSending(false)
    }
  }, [input, isSending, siteKey])

  const loadMoreHistory = useCallback(async () => {
    const cursor = historyCursor
    if (!cursor || isLoadingMoreHistory) return

    setIsLoadingMoreHistory(true)
    try {
      const body = await loadConversationPage(cursor)

      const olderMessages = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
      setMessages((current) => {
        const currentIds = new Set(current.map((message) => message.id))
        const uniqueOlderMessages = olderMessages.filter((message) => !currentIds.has(message.id))
        return [
          initialMessages[0],
          ...uniqueOlderMessages,
          ...current.filter((message) => message.id !== initialMessages[0].id),
        ]
      })
      setHistoryCursor(body.nextCursor ?? null)
      setHasMoreHistory(Boolean(body.hasMore && body.nextCursor))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '留言读取失败，请稍后再试。')
    } finally {
      setIsLoadingMoreHistory(false)
    }
  }, [historyCursor, isLoadingMoreHistory])

  useEffect(() => {
    if (!open) return

    if (!historyRequestedRef.current) {
      historyRequestedRef.current = true
      void loadConversationPage(null)
        .then((body) => {
          const history = Array.isArray(body.messages) ? body.messages.map(mapApiMessage) : []
          setMessages(history.length ? [initialMessages[0], ...history] : initialMessages)
          setHistoryCursor(body.nextCursor ?? null)
          setHasMoreHistory(Boolean(body.hasMore && body.nextCursor))
          setError(null)
        })
        .catch((loadError) => {
          historyRequestedRef.current = false
          setError(loadError instanceof Error ? loadError.message : '留言读取失败，请稍后再试。')
        })
      return
    }

    // Reopened within the same page load: walk newest → older until we overlap
    // a locally known message so replies added while closed cannot leave a gap.
    const knownIds = new Set(messagesRef.current.map((message) => message.id))
    void fetchMessagesUntilOverlap(knownIds)
      .then((fetched) => {
        setMessages((current) => {
          const known = new Set(current.map((message) => message.id))
          const additions = fetched.filter((message) => !known.has(message.id))
          return additions.length ? [...current, ...additions] : current
        })
        setError(null)
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : '留言读取失败，请稍后再试。')
      })
  }, [open])

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
            />
          ) : (
            <ChatLauncher
              key="chat-launcher"
              ref={launcherRef}
              open={open}
              panelId={PANEL_ID}
              onClick={() => setOpen(true)}
            />
          )}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  )
}
