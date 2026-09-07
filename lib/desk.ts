export type DeskTarget = 'computer' | 'radio' | 'frame' | 'note'

export type DeskPhase = 'loading' | 'overview' | 'entering' | 'focused' | 'leaving'

export const DESK_TARGETS: readonly DeskTarget[] = ['computer', 'radio', 'frame', 'note']

export const DESK_TARGET_LABELS: Record<DeskTarget, string> = {
  computer: 'Computer',
  radio: 'Radio',
  frame: 'Photos',
  note: 'Message',
}

export function shuffleDeskIds(ids: readonly string[], random = Math.random) {
  const result = [...ids]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    ;[result[index], result[swapIndex]] = [result[swapIndex], result[index]]
  }

  return result
}

export function createDeskShuffleBag(
  ids: readonly string[],
  previousId: string | null = null,
  random = Math.random
) {
  const bag = shuffleDeskIds(ids, random)

  if (bag.length > 1 && bag[0] === previousId) {
    const swapIndex = 1 + Math.floor(random() * (bag.length - 1))
    ;[bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]]
  }

  return bag
}
