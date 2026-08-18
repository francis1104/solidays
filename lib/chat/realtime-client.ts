export type RealtimeUiMessage = {
  id: string
  createdAt?: string
}

export type RealtimeBootstrapResult = 'retry' | 'stop'

export const MAX_REALTIME_HANDSHAKE_FAILURES = 3

export function shouldRefreshRealtimeBootstrap(handshakeFailures: number): boolean {
  return handshakeFailures >= MAX_REALTIME_HANDSHAKE_FAILURES
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
