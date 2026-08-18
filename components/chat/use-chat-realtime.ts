'use client'

import { useEffect, useRef } from 'react'
import { isChatRealtimeEvent, type ChatRealtimeEvent } from '@/lib/chat/realtime-events'
import {
  shouldRefreshRealtimeBootstrap,
  type RealtimeBootstrapResult,
} from '@/lib/chat/realtime-client'

export type { RealtimeBootstrapResult } from '@/lib/chat/realtime-client'

type UseChatRealtimeOptions = {
  enabled: boolean
  path: string
  onEvent: (event: ChatRealtimeEvent) => void
  onReconnect?: () => void | Promise<void>
  onHandshakeFailure?: () => RealtimeBootstrapResult | Promise<RealtimeBootstrapResult>
}

const MAX_RECONNECT_DELAY_MS = 10_000

function getWebSocketUrl(path: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${path}`
}

export function useChatRealtime({
  enabled,
  path,
  onEvent,
  onReconnect,
  onHandshakeFailure,
}: UseChatRealtimeOptions): void {
  const onEventRef = useRef(onEvent)
  const onReconnectRef = useRef(onReconnect)
  const onHandshakeFailureRef = useRef(onHandshakeFailure)
  onEventRef.current = onEvent
  onReconnectRef.current = onReconnect
  onHandshakeFailureRef.current = onHandshakeFailure

  useEffect(() => {
    if (!enabled) return

    let disposed = false
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let handshakeFailures = 0
    let bootstrapInFlight = false
    let activeSocket: WebSocket | null = null

    const stop = () => {
      disposed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null || bootstrapInFlight) return

      const delay = Math.min(500 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS)
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        connect()
      }, delay)
    }

    const refreshBootstrapAfterHandshakeFailures = () => {
      if (disposed || bootstrapInFlight) return

      const refresh = onHandshakeFailureRef.current
      if (!refresh) {
        console.warn('Chat realtime handshake failed repeatedly; stopping retries')
        stop()
        return
      }

      bootstrapInFlight = true
      void Promise.resolve()
        .then(() => refresh())
        .then((result) => {
          bootstrapInFlight = false
          if (disposed) return

          if (result === 'stop') {
            stop()
            return
          }

          handshakeFailures = 0
          scheduleReconnect()
        })
        .catch((error: unknown) => {
          bootstrapInFlight = false
          if (disposed) return

          console.warn('Chat realtime bootstrap refresh failed; retrying', error)
          scheduleReconnect()
        })
    }

    const connect = () => {
      if (disposed) return

      const socket = new WebSocket(getWebSocketUrl(path))
      activeSocket = socket
      let socketOpened = false
      let recovering = false
      let bufferedEvents: ChatRealtimeEvent[] = []

      socket.onopen = () => {
        socketOpened = true
        handshakeFailures = 0
        recovering = true
        bufferedEvents = []

        // Recover on the first connection as well as reconnects. History was
        // loaded before the socket opened, so writes in that gap must be read.
        void Promise.resolve()
          .then(() => onReconnectRef.current?.())
          .then(() => {
            if (disposed || activeSocket !== socket) return

            reconnectAttempt = 0
            recovering = false
            const pendingEvents = bufferedEvents
            bufferedEvents = []
            for (const event of pendingEvents) onEventRef.current(event)
          })
          .catch((error: unknown) => {
            if (disposed || activeSocket !== socket) return

            recovering = false
            console.warn('Chat realtime history recovery failed; reconnecting', error)
            socket.close(1012, 'Realtime history recovery failed')
          })
      }
      socket.onmessage = (message) => {
        if (typeof message.data !== 'string') return

        try {
          const event: unknown = JSON.parse(message.data)
          if (!isChatRealtimeEvent(event)) return
          if (recovering) {
            bufferedEvents.push(event)
            return
          }
          onEventRef.current(event)
        } catch {
          // Ignore malformed server frames; they must not affect the chat UI.
        }
      }
      socket.onerror = () => {
        socket.close()
      }
      socket.onclose = () => {
        const opened = socketOpened
        if (activeSocket === socket) activeSocket = null
        if (disposed || reconnectTimer !== null) return

        if (!opened) {
          handshakeFailures += 1
          if (shouldRefreshRealtimeBootstrap(handshakeFailures)) {
            refreshBootstrapAfterHandshakeFailures()
            return
          }
        }

        scheduleReconnect()
      }
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
      reconnectTimer = null
      activeSocket?.close(1000, 'Realtime subscription closed')
      activeSocket = null
    }
  }, [enabled, path])
}
