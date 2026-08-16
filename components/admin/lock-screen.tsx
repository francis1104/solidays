'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, KeyRound } from 'lucide-react'

type LockScreenProps = {
  onUnlock: (key: string) => Promise<boolean>
}

export function LockScreen({ onUnlock }: LockScreenProps) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const reducedMotion = useReducedMotion() ?? false

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!key.trim() || busy) return

    setBusy(true)
    setFailed(false)
    const ok = await onUnlock(key)
    setBusy(false)

    if (!ok) {
      setFailed(true)
      setKey('')
      setShakeKey((current) => current + 1)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="w-full max-w-sm"
      >
        <motion.div
          key={shakeKey}
          animate={failed && !reducedMotion ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-gray-200/80 bg-white/70 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/5"
        >
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary dark:bg-primary/15 flex size-10 items-center justify-center rounded-full">
              <span className="text-sm font-semibold">F</span>
            </div>
            <div>
              <p className="text-sm font-semibold">Francis · Admin</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">输入密钥进入留言后台</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3">
            <div className="relative">
              <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                aria-label="Admin 密钥"
                placeholder="密钥"
                disabled={busy}
                className="focus-visible:outline-primary w-full rounded-xl border border-gray-200/80 bg-white/70 py-2.5 pr-3 pl-9 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus-visible:outline-2 disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-gray-100"
              />
            </div>
            {failed ? (
              <p role="alert" className="px-1 text-xs text-red-600 dark:text-red-400">
                密钥无效或请求过于频繁，请稍后再试。
              </p>
            ) : null}
            <button
              type="submit"
              disabled={!key.trim() || busy}
              className="bg-primary text-primary-foreground focus-visible:outline-primary flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-opacity focus-visible:outline-2 disabled:opacity-40"
            >
              {busy ? '验证中…' : '解锁'}
              {!busy ? <ArrowRight className="size-4" /> : null}
            </button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  )
}
