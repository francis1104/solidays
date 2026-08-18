'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { LockScreen } from '@/components/admin/lock-screen'
import { ConversationList } from '@/components/admin/conversation-list'
import { ConversationDetail } from '@/components/admin/conversation-detail'
import type {
  AdminConversationFilter,
  AdminConversationsResponse,
  AdminConversation,
} from '@/components/admin/admin-types'

type AdminStage = 'checking' | 'locked' | 'ready' | 'error'
type LoadPageResult = 'ok' | 'unauthorized' | 'failed' | 'aborted'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export default function AdminPage() {
  const [stage, setStage] = useState<AdminStage>('checking')
  const [filter, setFilter] = useState<AdminConversationFilter>('all')
  const [conversations, setConversations] = useState<AdminConversation[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [pageDepth, setPageDepth] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const cursorStackRef = useRef<string[]>([])
  const loadGenerationRef = useRef(0)
  const loadAbortRef = useRef<AbortController | null>(null)
  const reducedMotion = useReducedMotion() ?? false

  const loadPage = useCallback(
    async (
      nextFilter: AdminConversationFilter,
      cursor: string | null,
      depth: number
    ): Promise<LoadPageResult> => {
      loadAbortRef.current?.abort()
      const controller = new AbortController()
      loadAbortRef.current = controller
      const generation = loadGenerationRef.current + 1
      loadGenerationRef.current = generation
      const isCurrent = () => generation === loadGenerationRef.current

      setLoading(true)
      setListError(null)
      try {
        const params = new URLSearchParams({ status: nextFilter, limit: '10' })
        if (cursor) params.set('cursor', cursor)
        const response = await fetch(`/api/admin/conversations?${params.toString()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!isCurrent()) return 'aborted'
        if (response.status === 401) {
          setStage('locked')
          return 'unauthorized'
        }
        if (!response.ok) {
          setListError('会话列表读取失败，请稍后再试。')
          return 'failed'
        }

        const body = (await response.json()) as AdminConversationsResponse
        if (!isCurrent()) return 'aborted'
        setConversations(body.conversations)
        setHasMore(body.hasMore)
        setPageDepth(depth)
        const stack = cursorStackRef.current
        stack.length = depth
        if (body.nextCursor) stack[depth] = body.nextCursor
        return 'ok'
      } catch (error) {
        if (!isCurrent() || isAbortError(error)) return 'aborted'
        setListError('会话列表读取失败，请稍后再试。')
        return 'failed'
      } finally {
        if (isCurrent()) setLoading(false)
      }
    },
    []
  )

  const applyInitialResult = useCallback((result: LoadPageResult) => {
    setStage((current) => {
      if (current !== 'checking' && current !== 'error') return current
      if (result === 'aborted') return current
      if (result === 'unauthorized') return 'locked'
      if (result === 'failed') return 'error'
      return 'ready'
    })
  }, [])

  useEffect(() => {
    void loadPage('all', null, 0).then(applyInitialResult)
    return () => {
      loadAbortRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUnlock = useCallback(
    async (key: string) => {
      try {
        const response = await fetch('/api/admin/session', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key }),
        })
        if (!response.ok) return false
      } catch {
        return false
      }

      setFilter('all')
      setSelectedId(null)
      setLogoutError(null)
      const result = await loadPage('all', null, 0)
      if (result === 'unauthorized') return false
      if (result === 'aborted') return true
      setStage(result === 'failed' ? 'error' : 'ready')
      return true
    },
    [loadPage]
  )

  const handleSessionExpired = useCallback(() => {
    setStage('locked')
    setSelectedId(null)
  }, [])

  const broadcastAdminLogout = useCallback(() => {
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel('solidays-admin-session')
    channel.postMessage({ type: 'logout' })
    channel.close()
  }, [])

  const handleLogout = useCallback(async () => {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(null)
    try {
      const response = await fetch('/api/admin/session', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
      })
      if (!response.ok) {
        setLogoutError('登出失败，请重试。')
        return
      }
      broadcastAdminLogout()
      setStage('locked')
      setSelectedId(null)
      setConversations([])
      setHasMore(false)
      setPageDepth(0)
      setListError(null)
    } catch {
      setLogoutError('登出失败，请重试。')
    } finally {
      setLoggingOut(false)
    }
  }, [broadcastAdminLogout, loggingOut])

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return

    const channel = new BroadcastChannel('solidays-admin-session')
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== 'object') return
      if ((event.data as { type?: unknown }).type !== 'logout') return
      handleSessionExpired()
    }

    channel.addEventListener('message', handleMessage)
    return () => {
      channel.removeEventListener('message', handleMessage)
      channel.close()
    }
  }, [handleSessionExpired])

  const handleFilterChange = useCallback(
    async (nextFilter: AdminConversationFilter) => {
      const result = await loadPage(nextFilter, null, 0)
      if (result !== 'ok') return
      setFilter(nextFilter)
      setSelectedId(null)
    },
    [loadPage]
  )

  const handlePrevPage = useCallback(() => {
    if (pageDepth === 0) return
    const cursor = pageDepth >= 2 ? cursorStackRef.current[pageDepth - 2] : null
    void loadPage(filter, cursor ?? null, pageDepth - 1)
  }, [filter, loadPage, pageDepth])

  const handleNextPage = useCallback(() => {
    const cursor = cursorStackRef.current[pageDepth]
    if (!cursor) return
    void loadPage(filter, cursor, pageDepth + 1)
  }, [filter, loadPage, pageDepth])

  const transition = reducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 240, damping: 26 }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16">
      <AnimatePresence mode="wait" initial={false}>
        {stage === 'checking' ? (
          <motion.div key="checking" exit={{ opacity: 0 }} className="py-24 text-center">
            <p className="text-sm text-gray-400">检查登录状态…</p>
          </motion.div>
        ) : stage === 'error' ? (
          <motion.div
            key="error"
            exit={{ opacity: 0 }}
            className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center"
          >
            <p className="text-sm text-red-600 dark:text-red-400">
              {listError ?? '留言列表读取失败，请稍后再试。'}
            </p>
            <button
              type="button"
              onClick={() => {
                setStage('checking')
                void loadPage('all', null, 0).then(applyInitialResult)
              }}
              className="rounded-full border border-gray-200/80 px-4 py-1.5 text-xs text-gray-600 transition-colors hover:bg-black/5 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/10"
            >
              重试
            </button>
          </motion.div>
        ) : stage === 'locked' ? (
          <motion.div key="locked" exit={{ opacity: 0 }} transition={transition}>
            <LockScreen onUnlock={handleUnlock} />
          </motion.div>
        ) : (
          <motion.div
            key="ready"
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
            className="flex flex-col gap-6"
          >
            <div className="flex items-center justify-between rounded-2xl border border-gray-200/80 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary dark:bg-primary/15 flex size-9 items-center justify-center rounded-full">
                  <span className="text-sm font-semibold">F</span>
                </div>
                <div>
                  <p className="text-sm font-semibold">Francis · Admin</p>
                  <p className="text-xs text-gray-400">留言后台</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <LogOut className="size-3.5" /> {loggingOut ? '登出中…' : '登出'}
                </button>
                {logoutError ? (
                  <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">
                    {logoutError}
                  </p>
                ) : null}
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {selectedId ? (
                <motion.div
                  key={`detail-${selectedId}`}
                  initial={reducedMotion ? false : { opacity: 0, x: 32 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 32 }}
                  transition={transition}
                >
                  <ConversationDetail
                    conversationId={selectedId}
                    onBack={() => {
                      setSelectedId(null)
                      void loadPage(
                        filter,
                        pageDepth === 0 ? null : (cursorStackRef.current[pageDepth - 1] ?? null),
                        pageDepth
                      )
                    }}
                    onSessionExpired={handleSessionExpired}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key={`list-${filter}-${pageDepth}`}
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                >
                  <div className="flex flex-col gap-3">
                    {listError ? (
                      <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {listError}
                      </p>
                    ) : null}
                    <ConversationList
                      conversations={conversations}
                      filter={filter}
                      onFilterChange={(nextFilter) => void handleFilterChange(nextFilter)}
                      loading={loading}
                      hasMore={hasMore}
                      pageDepth={pageDepth}
                      onPrevPage={handlePrevPage}
                      onNextPage={handleNextPage}
                      onOpen={setSelectedId}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
