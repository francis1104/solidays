export type MutableRef<T> = { current: T }

export type PendingClientMessage = {
  id: string | null
  content: string | null
}

export function acquireSendLock(ref: MutableRef<boolean>): boolean {
  if (ref.current) return false
  ref.current = true
  return true
}

export function releaseSendLock(ref: MutableRef<boolean>): void {
  ref.current = false
}

export function getOrCreateClientMessageId(
  pending: MutableRef<PendingClientMessage>,
  content: string,
  createId: () => string = () => crypto.randomUUID()
): string {
  if (pending.current.id && pending.current.content === content) {
    return pending.current.id
  }

  const id = createId()
  pending.current = { id, content }
  return id
}

export function acknowledgeClientMessage(pending: MutableRef<PendingClientMessage>): void {
  pending.current = { id: null, content: null }
}
