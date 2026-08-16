'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronLeft, ChevronRight, MessageCircle, Reply } from 'lucide-react'
import { cn } from '@/components/lib/utils'
import {
  formatRelativeTime,
  type AdminConversation,
  type AdminConversationFilter,
} from './admin-types'

type ConversationListProps = {
  conversations: AdminConversation[]
  filter: AdminConversationFilter
  onFilterChange: (filter: AdminConversationFilter) => void
  loading: boolean
  hasMore: boolean
  pageDepth: number
  onPrevPage: () => void
  onNextPage: () => void
  onOpen: (conversationId: string) => void
}

const FILTERS: { value: AdminConversationFilter; label: string }[] = [
  { value: 'open', label: '进行中' },
  { value: 'all', label: '全部' },
  { value: 'closed', label: '已关闭' },
]

export function ConversationList({
  conversations,
  filter,
  onFilterChange,
  loading,
  hasMore,
  pageDepth,
  onPrevPage,
  onNextPage,
  onOpen,
}: ConversationListProps) {
  const reducedMotion = useReducedMotion() ?? false

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">会话</h2>
        <div className="flex rounded-full border border-gray-200/80 bg-white/70 p-0.5 text-xs dark:border-white/10 dark:bg-white/5">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onFilterChange(item.value)}
              disabled={loading}
              className={cn(
                'rounded-full px-3 py-1 transition-colors disabled:opacity-50',
                filter === item.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">加载中…</p>
        ) : conversations.length === 0 ? (
          <div className="rounded-2xl border border-gray-200/80 bg-white/70 py-10 text-center dark:border-white/10 dark:bg-white/5">
            <MessageCircle className="mx-auto size-6 text-gray-300 dark:text-gray-600" />
            <p className="mt-2 text-sm text-gray-400">暂无会话</p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {conversations.map((conversation) => (
              <motion.button
                key={conversation.id}
                type="button"
                layout={!reducedMotion}
                initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                onClick={() => onOpen(conversation.id)}
                className="group hover:border-primary/40 rounded-2xl border border-gray-200/80 bg-white/70 p-4 text-left shadow-sm backdrop-blur-md transition-colors dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">
                      访客 #{conversation.visitorId.slice(0, 8)}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-medium',
                        conversation.status === 'open'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-gray-400/10 text-gray-500 dark:text-gray-400'
                      )}
                    >
                      {conversation.status === 'open' ? '进行中' : '已关闭'}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatRelativeTime(conversation.updatedAt)}
                  </span>
                </div>

                {conversation.lastMessage ? (
                  <p className="mt-2 line-clamp-2 text-sm text-gray-700 dark:text-gray-300">
                    {conversation.lastMessage.role === 'owner' ? (
                      <Reply className="mr-1 inline size-3.5 text-[#FBF050]" aria-label="已回复" />
                    ) : null}
                    {conversation.lastMessage.content}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-gray-400">（无留言）</p>
                )}

                <p className="mt-2 text-xs text-gray-400">
                  访客留言 {conversation.visitorMessageCount} 条
                </p>
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onPrevPage}
          disabled={pageDepth === 0 || loading}
          className="text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-30 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <ChevronLeft className="inline size-4" /> 上一页
        </button>
        <span className="text-xs text-gray-400">第 {pageDepth + 1} 页</span>
        <button
          type="button"
          onClick={onNextPage}
          disabled={!hasMore || loading}
          className="text-gray-500 transition-colors hover:text-gray-900 disabled:opacity-30 dark:text-gray-400 dark:hover:text-gray-100"
        >
          下一页 <ChevronRight className="inline size-4" />
        </button>
      </div>
    </div>
  )
}
