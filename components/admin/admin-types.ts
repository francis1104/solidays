export type AdminConversationStatus = 'open' | 'closed'

export type AdminConversation = {
  id: string
  visitorId: string
  status: AdminConversationStatus
  createdAt: string
  updatedAt: string
  visitorMessageCount: number
  lastMessage: { role: AdminMessageRole; content: string; createdAt: string } | null
}

export type AdminMessageRole = 'visitor' | 'owner' | 'system'

export type AdminMessage = {
  id: string
  role: AdminMessageRole
  content: string
  pageUrl: string | null
  createdAt: string
}

export type AdminConversationFilter = 'open' | 'closed' | 'all'

export type AdminConversationsResponse = {
  conversations: AdminConversation[]
  hasMore: boolean
  nextCursor: string | null
}

export type AdminMessagesResponse = {
  realtimeEnabled: boolean
  conversation: AdminConversation
  messages: AdminMessage[]
  hasMore: boolean
  nextCursor: string | null
}

export type AdminReplyResponse = {
  conversation: AdminConversation
  message: AdminMessage
}

export function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime()
  if (!Number.isFinite(timestamp)) return ''

  const difference = Date.now() - timestamp
  if (difference < 60_000) return '刚刚'
  if (difference < 3_600_000) return `${Math.floor(difference / 60_000)} 分钟前`
  if (difference < 86_400_000) return `${Math.floor(difference / 3_600_000)} 小时前`
  if (difference < 30 * 86_400_000) return `${Math.floor(difference / 86_400_000)} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN')
}
