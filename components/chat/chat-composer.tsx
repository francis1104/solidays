'use client'

import { useEffect, useRef, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/components/lib/utils'

type ChatComposerProps = {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  disabled?: boolean
  error?: string | null
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  textareaRef,
  disabled = false,
  error = null,
}: ChatComposerProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const textarea = localRef.current
    if (!textarea) return

    textarea.style.height = '0px'
    textarea.style.height = String(Math.min(textarea.scrollHeight, 120)) + 'px'
  }, [value])

  const setTextareaRef = (node: HTMLTextAreaElement | null) => {
    localRef.current = node
    textareaRef.current = node
  }

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(event.target.value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

    event.preventDefault()
    onSubmit()
  }

  const canSubmit = value.trim().length > 0 && !disabled

  return (
    <form
      className="shrink-0 border-t border-gray-200/50 bg-white/25 p-3 dark:border-white/10 dark:bg-black/10"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSubmit) onSubmit()
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border border-gray-200/80 bg-white/70 p-1.5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <textarea
          ref={setTextareaRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="匿名留言"
          className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-base leading-5 text-gray-900 outline-none placeholder:text-gray-400 sm:text-sm dark:text-gray-100 dark:placeholder:text-gray-500"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!canSubmit}
          className={cn(
            'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary flex size-9 shrink-0 items-center justify-center rounded-full transition-[opacity,transform,background-color] focus-visible:outline-2 active:scale-95 disabled:pointer-events-none disabled:opacity-35'
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2.2} />
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 px-2 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <p className="mt-1.5 px-2 text-[10px] text-gray-400 dark:text-gray-500">
        提交后会保存为匿名留言 · Shift + Enter 换行
      </p>
    </form>
  )
}
