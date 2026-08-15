'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

type TurnstileWidgetId = string | number

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      execution: 'execute'
      size: 'invisible'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
      'timeout-callback': () => void
      'unsupported-callback': () => void
    }
  ) => TurnstileWidgetId
  execute: (widgetId: TurnstileWidgetId) => void
  reset: (widgetId: TurnstileWidgetId) => void
  remove?: (widgetId: TurnstileWidgetId) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

export type ChatTurnstileHandle = {
  getToken: () => Promise<string | null>
  reset: () => void
}

type ChatTurnstileProps = {
  siteKey: string
}

const TURNSTILE_SCRIPT_ID = 'cloudflare-turnstile-script'
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
const TURNSTILE_TOKEN_TIMEOUT_MS = 10_000
type TurnstileTimeoutHandle = number

let scriptPromise: Promise<void> | null = null

function settlePendingToken(
  pendingResolveRef: { current: ((token: string | null) => void) | null },
  pendingTimeoutRef: { current: TurnstileTimeoutHandle | null },
  token: string | null
) {
  if (pendingTimeoutRef.current !== null) {
    clearTimeout(pendingTimeoutRef.current)
    pendingTimeoutRef.current = null
  }

  const resolve = pendingResolveRef.current
  pendingResolveRef.current = null
  resolve?.(token)
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('Turnstile requires a browser'))
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Turnstile failed to load')), {
        once: true,
      })
      return
    }

    const script = document.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Turnstile failed to load'))
    document.head.appendChild(script)
  })

  return scriptPromise
}

export const ChatTurnstile = forwardRef<ChatTurnstileHandle, ChatTurnstileProps>(
  function ChatTurnstile({ siteKey }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const widgetIdRef = useRef<TurnstileWidgetId | null>(null)
    const tokenRef = useRef<string | null>(null)
    const pendingResolveRef = useRef<((token: string | null) => void) | null>(null)
    const pendingTimeoutRef = useRef<TurnstileTimeoutHandle | null>(null)
    const readyPromiseRef = useRef<Promise<TurnstileWidgetId | null> | null>(null)
    const readyResolveRef = useRef<((widgetId: TurnstileWidgetId | null) => void) | null>(null)

    useEffect(() => {
      if (!siteKey || !containerRef.current) return

      let cancelled = false
      readyPromiseRef.current = new Promise((resolve) => {
        readyResolveRef.current = resolve
      })

      void loadTurnstileScript()
        .then(() => {
          if (cancelled) {
            readyResolveRef.current?.(null)
            readyResolveRef.current = null
            return
          }

          const container = containerRef.current
          const turnstile = window.turnstile
          if (!container || !turnstile) {
            readyResolveRef.current?.(null)
            readyResolveRef.current = null
            return
          }

          if (widgetIdRef.current !== null) {
            readyResolveRef.current?.(widgetIdRef.current)
            readyResolveRef.current = null
            return
          }

          try {
            widgetIdRef.current = turnstile.render(container, {
              sitekey: siteKey,
              action: 'chat_message',
              execution: 'execute',
              size: 'invisible',
              callback: (token) => {
                tokenRef.current = token
                settlePendingToken(pendingResolveRef, pendingTimeoutRef, token)
              },
              'expired-callback': () => {
                tokenRef.current = null
                settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
              },
              'error-callback': () => {
                tokenRef.current = null
                settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
              },
              'timeout-callback': () => {
                tokenRef.current = null
                settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
              },
              'unsupported-callback': () => {
                tokenRef.current = null
                settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
              },
            })
            readyResolveRef.current?.(widgetIdRef.current)
            readyResolveRef.current = null
          } catch {
            readyResolveRef.current?.(null)
            readyResolveRef.current = null
          }
        })
        .catch(() => {
          readyResolveRef.current?.(null)
          readyResolveRef.current = null
          settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
        })

      return () => {
        cancelled = true
        readyResolveRef.current?.(null)
        readyResolveRef.current = null
        settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
        if (widgetIdRef.current !== null) {
          window.turnstile?.remove?.(widgetIdRef.current)
          widgetIdRef.current = null
        }
      }
    }, [siteKey])

    useImperativeHandle(
      ref,
      () => ({
        getToken: async () => {
          const turnstile = window.turnstile
          if (!siteKey || !turnstile) return null

          let widgetId = widgetIdRef.current
          if (widgetId === null && readyPromiseRef.current) {
            widgetId = await Promise.race([
              readyPromiseRef.current,
              new Promise<null>((resolve) => {
                window.setTimeout(() => resolve(null), TURNSTILE_TOKEN_TIMEOUT_MS)
              }),
            ])
          }
          if (widgetId === null) return null

          if (tokenRef.current) {
            const token = tokenRef.current
            tokenRef.current = null
            return token
          }

          return new Promise((resolve) => {
            pendingResolveRef.current = resolve
            pendingTimeoutRef.current = window.setTimeout(() => {
              settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
            }, TURNSTILE_TOKEN_TIMEOUT_MS)
            try {
              turnstile.execute(widgetId)
            } catch {
              settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
            }
          })
        },
        reset: () => {
          tokenRef.current = null
          settlePendingToken(pendingResolveRef, pendingTimeoutRef, null)
          if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current)
        },
      }),
      [siteKey]
    )

    return (
      <div
        ref={containerRef}
        aria-hidden="true"
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
    )
  }
)
