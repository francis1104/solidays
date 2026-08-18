export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
}

export type ChatApiMessage = {
  id: string
  role: 'visitor' | 'owner' | 'system'
  content: string
  pageUrl: string | null
  createdAt: string
}

export type ChatApiResponse = {
  realtimeEnabled: boolean
  conversation: {
    id: string
    status: 'open' | 'closed'
    lastPageUrl: string | null
    createdAt: string
    updatedAt: string
  } | null
  messages: ChatApiMessage[]
  hasMore: boolean
  nextCursor: string | null
}
