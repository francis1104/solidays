import type { AdminConversationListItem } from './repository'
import type { ConversationRow, MessageRow } from '@/lib/chat/types'

export type AdminConversationDto = {
  id: string
  visitorId: string
  status: 'open' | 'closed'
  createdAt: string
  updatedAt: string
  visitorMessageCount: number
  lastMessage: { role: 'visitor' | 'owner' | 'system'; content: string; createdAt: string } | null
}

export function toAdminConversationListItemDto(
  item: AdminConversationListItem
): AdminConversationDto {
  return {
    id: item.id,
    visitorId: item.visitorId,
    status: item.status,
    createdAt: '',
    updatedAt: new Date(item.updatedAt).toISOString(),
    visitorMessageCount: item.visitorMessageCount,
    lastMessage: item.lastMessage
      ? {
          role: item.lastMessage.role,
          content: item.lastMessage.content,
          createdAt: new Date(item.lastMessage.createdAt).toISOString(),
        }
      : null,
  }
}

export function toAdminConversationDto(row: ConversationRow): AdminConversationDto {
  return {
    id: row.id,
    visitorId: row.visitor_id,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    visitorMessageCount: 0,
    lastMessage: null,
  }
}

export function toAdminMessageDto(row: MessageRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    pageUrl: row.page_url,
    createdAt: new Date(row.created_at).toISOString(),
  }
}
