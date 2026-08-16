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

type AdminStage = 'checking' | 'locked' | 'ready'

export default function AdminPage() {
  const [stage, setStage] = useState<AdminStage>('checking')
  const [filter, setFilter] = useState<AdminConversationFilter>('all')
  const [conversations, setConversations] = useState<AdminConversation[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [pageDepth, setPageDepth] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const cursorStackRef = useRef<string[]>([])
  const reducedMotion = useReducedMotion() ?? false

  const loadPage = useCallback(
    async (nextFilter: AdminConversationFilter, cursor: string | null, depth: number) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ status: nextFilter, limit: '10' })
        if (cursor) params.set('cursor', cursor)
        const response = await fetch(`/api/admin/conversations?${params.toString()}`, {
          credentials: 'same-origin',
          cache: 'no-store',
        })
        if (response.status === 401) {
          setStage('locked')
          return
        }
        if (!response.ok) throw new Error('list failed')

        const body = (await response.json()) as AdminConversationsResponse
        setConversations(body.conversations)
        setHasMore(body.hasMore)
        setPageDepth(depth)
        const stack = cursorStackRef.current
        stack.length = depth
        if (body.nextCursor) stack[depth] = body.nextCursor
      } catch {
        setConversations([])
        setHasMore(false)
      } finally {
        setLoading(false)
      }
    },
    []
  )

  useEffect(() => {
    void loadPage('all', null, 0).then(() => {
      setStage((current) => (current === 'checking' ? 'ready' : current))
    })
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

      setStage('ready')
      setFilter('all')
      setSelectedId(null)
      void loadPage('all', null, 0)
      return true
    },
    [loadPage]
  )

  const handleLogout = useCallback(async () => {
    void fetch('/api/admin/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
    })
    setStage('locked')
    setSelectedId(null)
    setConversations([])
  }, [])

  const handleSessionExpired = useCallback(() => {
    setStage('locked')
    setSelectedId(null)
  }, [])

  const handleFilterChange = useCallback(
    (nextFilter: AdminConversationFilter) => {
      setFilter(nextFilter)
      setSelectedId(null)
      void loadPage(nextFilter, null, 0)
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
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <LogOut className="size-3.5" /> 登出
              </button>
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
                  <ConversationList
                    conversations={conversations}
                    filter={filter}
                    onFilterChange={handleFilterChange}
                    loading={loading}
                    hasMore={hasMore}
                    pageDepth={pageDepth}
                    onPrevPage={handlePrevPage}
                    onNextPage={handleNextPage}
                    onOpen={setSelectedId}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
