const DATE_PARTS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: '2-digit',
  year: 'numeric',
}

function dateParts(isoDate: string) {
  const date = new Date(`${isoDate}T00:00:00`)
  const parts = new Intl.DateTimeFormat('en-US', DATE_PARTS).formatToParts(date)
  const month = parts.find((part) => part.type === 'month')?.value ?? ''
  const day = parts.find((part) => part.type === 'day')?.value ?? ''
  const year = parts.find((part) => part.type === 'year')?.value ?? ''
  return { month, day, year }
}

export function formatDuration(seconds: number, padded = false) {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const minuteLabel = padded ? minutes.toString().padStart(2, '0') : String(minutes)
  return `${minuteLabel}:${secs.toString().padStart(2, '0')}`
}

export function formatClipDate(isoDate: string) {
  const { month, day, year } = dateParts(isoDate)
  return `${month.toUpperCase()} ${day} ${year}`
}

export function formatAriaDate(isoDate: string) {
  const { month, day, year } = dateParts(isoDate)
  return `${month} ${day} ${year}`
}

export function formatLightboxMeta(isoDate: string, seconds: number, type: string) {
  return `${formatClipDate(isoDate)} · ${formatDuration(seconds, true)} · ${type.toUpperCase()}`
}

export function formatIndexNumber(index: number) {
  return String(index + 1).padStart(3, '0')
}

export function formatClipPosition(index: number, total: number) {
  return `${String(index + 1).padStart(2, '0')} / ${total}`
}

export function gameInitials(name: string) {
  const words = name
    .replace(/['’]/g, '')
    .split(/[\s:]+/)
    .filter(Boolean)

  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()

  const significant =
    words.length > 2 && /^\d+$/.test(words[words.length - 1]) ? words.slice(0, -1) : words

  return `${significant[0][0]}${significant[1][0]}`.toUpperCase()
}

export function playClipLabel(title: string, recordedAt: string) {
  return `Play ${title} clip recorded ${formatAriaDate(recordedAt)}`
}
