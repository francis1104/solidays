'use client'

import { X } from 'lucide-react'

type ChatHeaderProps = {
  onClose: () => void
}

export function ChatHeader({ onClose }: ChatHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-gray-200/60 px-4 dark:border-white/10">
      <div className="flex min-w-0 items-center gap-3">
        <div className="bg-primary/10 text-primary dark:bg-primary/15 relative flex size-9 shrink-0 items-center justify-center rounded-full">
          <span className="text-sm font-semibold">S</span>
          <span
            aria-hidden="true"
            className="absolute right-0 bottom-0 size-2 rounded-full bg-emerald-500 ring-2 ring-white/80 dark:ring-gray-950/80"
          />
        </div>
        <div className="min-w-0">
          <h2 id="floating-chat-title" className="truncate text-sm font-semibold">
            匿名留言
          </h2>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
            留言会保存，暂不实时回复
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="Close chat"
          data-testid="chat-close"
          className="focus-visible:outline-primary flex size-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-900 focus-visible:outline-2 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          onClick={onClose}
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  )
}
