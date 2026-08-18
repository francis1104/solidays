'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { clearSingleFlight, getOrCreateSingleFlight } from '@/lib/chat/single-flight'

type TurnstileWidgetId = string | number

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      execution: 'execute'
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
type ReadyResolve = (widgetId: TurnstileWidgetId | null) => void

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

function settleReady(
  readyResolveRef: { current: ReadyResolve | null },
  owner: ReadyResolve | null,
  widgetId: TurnstileWidgetId | null
) {
  if (!owner || readyResolveRef.current !== owner) return
  readyResolveRef.current = null
  owner(widgetId)
}

function waitForReady(
  readyPromise: Promise<TurnstileWidgetId | null>,
  timeoutMs: number
): Promise<TurnstileWidgetId | null> {
  return new Promise((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), timeoutMs)
    void readyPromise.then((widgetId) => {
      window.clearTimeout(timeoutId)
      resolve(widgetId)
    })
  })
}

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined')
    return Promise.reject(new Error('Turnstile requires a browser'))
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  document.getElementById(TURNSTILE_SCRIPT_ID)?.remove()

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = TURNSTILE_SCRIPT_ID
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      scriptPromise = null
      reject(new Error('Turnstile failed to load'))
    }
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
    const pendingTokenPromiseRef = useRef<Promise<string | null> | null>(null)
    const readyPromiseRef = useRef<Promise<TurnstileWidgetId | null> | null>(null)
    const readyResolveRef = useRef<ReadyResolve | null>(null)
    const challengeInFlightRef = useRef(false)

    const settlePending = useCallback((token: string | null) => {
      clearSingleFlight(pendingTokenPromiseRef)
      settlePendingToken(pendingResolveRef, pendingTimeoutRef, token)
    }, [])

    const startChallenge = useCallback(() => {
      const widgetId = widgetIdRef.current
      const turnstile = window.turnstile
      if (!widgetId || !turnstile || tokenRef.current || challengeInFlightRef.current) return

      challengeInFlightRef.current = true
      try {
        turnstile.execute(widgetId)
      } catch {
        challengeInFlightRef.current = false
        settlePending(null)
      }
    }, [settlePending])

    useEffect(() => {
      if (!siteKey || !containerRef.current) return

      let cancelled = false
      let resolveReady: ReadyResolve | null = null
      const readyPromise = new Promise<TurnstileWidgetId | null>((resolve) => {
        resolveReady = resolve
        readyResolveRef.current = resolve
      })
      readyPromiseRef.current = readyPromise

      void loadTurnstileScript()
        .then(() => {
          if (cancelled) {
            settleReady(readyResolveRef, resolveReady, null)
            return
          }

          const container = containerRef.current
          const turnstile = window.turnstile
          if (!container || !turnstile) {
            settleReady(readyResolveRef, resolveReady, null)
            return
          }

          if (widgetIdRef.current !== null) {
            settleReady(readyResolveRef, resolveReady, widgetIdRef.current)
            return
          }

          try {
            widgetIdRef.current = turnstile.render(container, {
              sitekey: siteKey,
              action: 'chat_message',
              execution: 'execute',
              callback: (token) => {
                tokenRef.current = token
                challengeInFlightRef.current = false
                settlePending(token)
              },
              'expired-callback': () => {
                tokenRef.current = null
                challengeInFlightRef.current = false
                settlePending(null)
              },
              'error-callback': () => {
                tokenRef.current = null
                challengeInFlightRef.current = false
                settlePending(null)
              },
              'timeout-callback': () => {
                tokenRef.current = null
                challengeInFlightRef.current = false
                settlePending(null)
              },
              'unsupported-callback': () => {
                tokenRef.current = null
                challengeInFlightRef.current = false
                settlePending(null)
              },
            })
            settleReady(readyResolveRef, resolveReady, widgetIdRef.current)
            startChallenge()
          } catch {
            settleReady(readyResolveRef, resolveReady, null)
          }
        })
        .catch(() => {
          settleReady(readyResolveRef, resolveReady, null)
          settlePending(null)
        })

      return () => {
        cancelled = true
        if (readyPromiseRef.current === readyPromise) {
          readyPromiseRef.current = null
        }
        settleReady(readyResolveRef, resolveReady, null)
        settlePending(null)
        challengeInFlightRef.current = false
        if (widgetIdRef.current !== null) {
          window.turnstile?.remove?.(widgetIdRef.current)
          widgetIdRef.current = null
        }
      }
    }, [siteKey, settlePending, startChallenge])

    useImperativeHandle(
      ref,
      () => ({
        getToken: async () => {
          if (!siteKey) return null
          if (pendingTokenPromiseRef.current) return pendingTokenPromiseRef.current

          let widgetId = widgetIdRef.current
          if (widgetId === null) {
            if (!readyPromiseRef.current) return null
            widgetId = await waitForReady(readyPromiseRef.current, TURNSTILE_TOKEN_TIMEOUT_MS)
          }
          if (widgetId === null) return null

          const turnstile = window.turnstile
          if (!turnstile) return null

          if (tokenRef.current) {
            const token = tokenRef.current
            tokenRef.current = null
            return token
          }

          const pendingPromise = getOrCreateSingleFlight(pendingTokenPromiseRef, () => {
            return new Promise<string | null>((resolve) => {
              pendingResolveRef.current = resolve
              pendingTimeoutRef.current = window.setTimeout(() => {
                settlePending(null)
              }, TURNSTILE_TOKEN_TIMEOUT_MS)
            })
          })
          startChallenge()
          return pendingPromise
        },
        reset: () => {
          tokenRef.current = null
          challengeInFlightRef.current = false
          settlePending(null)
          if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current)
          startChallenge()
        },
      }),
      [siteKey, settlePending, startChallenge]
    )

    return <div ref={containerRef} aria-hidden="true" className="sr-only" />
  }
)
