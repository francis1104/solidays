import type { ChatRealtimeEvent } from './realtime-events'

export type RealtimeUiMessage = {
  id: string
  createdAt?: string
}

export type RealtimeBootstrapResult = 'retry' | 'stop'

export type RealtimeConversationSnapshot = {
  conversationId: string | null
  status: 'open' | 'closed'
  realtimeEnabled: boolean
}

export type RealtimeEventDecision =
  | { type: 'ignore' }
  | { type: 'conversation.closed'; conversationId: string }
  | {
      type: 'message.created'
      conversationId: string
      message: Extract<ChatRealtimeEvent, { type: 'message.created' }>['message']
    }

export type RealtimeSendSuccessDecision =
  | {
      type: 'apply-response'
      commandCommitted: true
      inputAcknowledged: true
      stateSynchronized: true
    }
  | {
      type: 'reconcile'
      commandCommitted: true
      inputAcknowledged: true
      stateSynchronized: false
    }

export type RealtimeCommandSyncDecision =
  | {
      type: 'synchronized'
      commandCommitted: true
      inputAcknowledged: true
      stateSynchronized: true
      retryScheduled: false
    }
  | {
      type: 'retrying'
      commandCommitted: true
      inputAcknowledged: true
      stateSynchronized: false
      retryScheduled: true
    }
  | {
      type: 'sync-failed'
      commandCommitted: true
      inputAcknowledged: true
      stateSynchronized: false
      retryScheduled: false
    }

export const MAX_REALTIME_HANDSHAKE_FAILURES = 3
export const MAX_AUTHORITATIVE_RECONCILIATION_RETRIES = 3

const AUTHORITATIVE_RECONCILIATION_RETRY_DELAYS_MS = [500, 1_000, 2_000] as const

export function shouldRefreshRealtimeBootstrap(handshakeFailures: number): boolean {
  return handshakeFailures >= MAX_REALTIME_HANDSHAKE_FAILURES
}

export function isRealtimeGenerationCurrent(expected: number, current: number): boolean {
  return expected === current
}

export function decideRealtimeSendSuccess(
  expectedGeneration: number,
  currentGeneration: number
): RealtimeSendSuccessDecision {
  return isRealtimeGenerationCurrent(expectedGeneration, currentGeneration)
    ? {
        type: 'apply-response',
        commandCommitted: true,
        inputAcknowledged: true,
        stateSynchronized: true,
      }
    : {
        type: 'reconcile',
        commandCommitted: true,
        inputAcknowledged: true,
        stateSynchronized: false,
      }
}

export function decideRealtimeCommandSync(
  sendSuccess: RealtimeSendSuccessDecision,
  reconciliation: 'succeeded' | 'failed',
  retryScheduled = false
): RealtimeCommandSyncDecision {
  if (sendSuccess.stateSynchronized || reconciliation === 'succeeded') {
    return {
      type: 'synchronized',
      commandCommitted: true,
      inputAcknowledged: true,
      stateSynchronized: true,
      retryScheduled: false,
    }
  }

  return retryScheduled
    ? {
        type: 'retrying',
        commandCommitted: true,
        inputAcknowledged: true,
        stateSynchronized: false,
        retryScheduled: true,
      }
    : {
        type: 'sync-failed',
        commandCommitted: true,
        inputAcknowledged: true,
        stateSynchronized: false,
        retryScheduled: false,
      }
}

export function getAuthoritativeReconciliationRetryDelay(attempt: number): number | null {
  if (
    !Number.isInteger(attempt) ||
    attempt < 0 ||
    attempt >= MAX_AUTHORITATIVE_RECONCILIATION_RETRIES
  ) {
    return null
  }

  return AUTHORITATIVE_RECONCILIATION_RETRY_DELAYS_MS[attempt]
}

export function hasConversationIdentityChanged(
  currentConversationId: string | null,
  nextConversationId: string | null
): boolean {
  return currentConversationId !== nextConversationId
}

export function decideRealtimeEvent(
  event: ChatRealtimeEvent,
  currentConversationId: string | null
): RealtimeEventDecision {
  if (!currentConversationId || event.conversationId !== currentConversationId) {
    return { type: 'ignore' }
  }

  if (event.type === 'conversation.closed') {
    return { type: 'conversation.closed', conversationId: currentConversationId }
  }

  return {
    type: 'message.created',
    conversationId: currentConversationId,
    message: event.message,
  }
}

export function applyConversationClosedBarrier(
  state: RealtimeConversationSnapshot,
  conversationId: string
): RealtimeConversationSnapshot {
  if (state.conversationId !== conversationId) return state

  return {
    ...state,
    status: 'closed',
    realtimeEnabled: false,
  }
}

export function applyRealtimeError(
  currentError: string | null,
  expectedGeneration: number,
  currentGeneration: number,
  nextError: string
): string | null {
  return isRealtimeGenerationCurrent(expectedGeneration, currentGeneration)
    ? nextError
    : currentError
}

function getTimestamp(message: RealtimeUiMessage): number {
  if (!message.createdAt) return Number.NEGATIVE_INFINITY

  const timestamp = Date.parse(message.createdAt)
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY
}

function compareMessages(left: RealtimeUiMessage, right: RealtimeUiMessage): number {
  const timestampDifference = getTimestamp(left) - getTimestamp(right)
  if (timestampDifference !== 0) return timestampDifference
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

export function mergeRealtimeMessages<T extends RealtimeUiMessage>(
  current: readonly T[],
  incoming: readonly T[],
  pinnedFirstId?: string
): T[] {
  const byId = new Map<string, T>()
  for (const message of current) byId.set(message.id, message)
  for (const message of incoming) byId.set(message.id, message)

  return [...byId.values()].sort((left, right) => {
    if (pinnedFirstId) {
      if (left.id === pinnedFirstId) return -1
      if (right.id === pinnedFirstId) return 1
    }
    return compareMessages(left, right)
  })
}
