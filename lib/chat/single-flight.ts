export type PromiseRef<T> = { current: Promise<T> | null }

export function getOrCreateSingleFlight<T>(
  pending: PromiseRef<T>,
  create: () => Promise<T>
): Promise<T> {
  if (pending.current) return pending.current

  const promise = create()
  pending.current = promise
  return promise
}

export function clearSingleFlight<T>(pending: PromiseRef<T>, promise?: Promise<T>): void {
  if (!promise || pending.current === promise) pending.current = null
}
