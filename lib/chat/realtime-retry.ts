export const REALTIME_PUBLISH_RETRY_DELAYS_MS = [0, 50, 200] as const

export async function retryRealtimePublish(
  operation: () => Promise<void>,
  delays: readonly number[] = REALTIME_PUBLISH_RETRY_DELAYS_MS
): Promise<void> {
  let lastError: unknown

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt] ?? 0
    if (delay > 0) {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay))
    }

    try {
      await operation()
      return
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('CHAT_REALTIME_PUBLISH_FAILED')
}
