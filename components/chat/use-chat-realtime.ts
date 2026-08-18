'use client'

import { useEffect, useRef } from 'react'
import { isChatRealtimeEvent, type ChatRealtimeEvent } from '@/lib/chat/realtime-events'

type UseChatRealtimeOptions = {
  enabled: boolean
  path: string
  onEvent: (event: ChatRealtimeEvent) => void
  onReconnect?: () => void | Promise<void>
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
}: UseChatRealtimeOptions): void {
  const onEventRef = useRef(onEvent)
  const onReconnectRef = useRef(onReconnect)
  onEventRef.current = onEvent
  onReconnectRef.current = onReconnect

  useEffect(() => {
    if (!enabled) return

    let disposed = false
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let activeSocket: WebSocket | null = null

    const connect = () => {
      if (disposed) return

      const socket = new WebSocket(getWebSocketUrl(path))
      activeSocket = socket
      let recovering = false
      let bufferedEvents: ChatRealtimeEvent[] = []

      socket.onopen = () => {
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
        if (activeSocket === socket) activeSocket = null
        if (disposed || reconnectTimer !== null) return

        const delay = Math.min(500 * 2 ** reconnectAttempt, MAX_RECONNECT_DELAY_MS)
        reconnectAttempt += 1
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null
          connect()
        }, delay)
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
