export type ChatRole = 'visitor' | 'owner' | 'system'

export type ConversationStatus = 'open' | 'closed'

export type ConversationRow = {
  id: string
  visitor_id: string
  status: ConversationStatus
  last_page_url: string | null
  created_at: number
  updated_at: number
}

export type MessageRow = {
  id: string
  conversation_id: string
  role: ChatRole
  content: string
  page_url: string | null
  created_at: number
}

export type ChatMessageDto = {
  id: string
  role: ChatRole
  content: string
  pageUrl: string | null
  createdAt: string
}

export type ChatConversationDto = {
  id: string
  status: ConversationStatus
  lastPageUrl: string | null
  createdAt: string
  updatedAt: string
}

export type ChatConversationPayload = {
  conversation: ChatConversationDto | null
  messages: ChatMessageDto[]
  hasMore: boolean
  nextCursor: string | null
}

export type ChatMessageInput = {
  content: string
  pageUrl: string | null
  turnstileToken: string
}

export function toMessageDto(row: MessageRow): ChatMessageDto {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    pageUrl: row.page_url,
    createdAt: new Date(row.created_at).toISOString(),
  }
}

export function toConversationDto(row: ConversationRow): ChatConversationDto {
  return {
    id: row.id,
    status: row.status,
    lastPageUrl: row.last_page_url,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}
