import type { ChatRole, ConversationRow, ConversationStatus, MessageRow } from '../chat/types.ts'
import {
  ChatIdempotencyConflictError,
  findChatMessageByClientMessageId,
  isUniqueConstraintError,
} from '../chat/repository.ts'

export type AdminConversationListItem = {
  id: string
  visitorId: string
  status: ConversationStatus
  updatedAt: number
  visitorMessageCount: number
  lastMessage: { role: ChatRole; content: string; createdAt: number } | null
}

export type AdminConversationPage = {
  conversations: AdminConversationListItem[]
  hasMore: boolean
  nextCursor: string | null
}

export type AdminConversationFilter = 'open' | 'closed' | 'all'

export type AdminConversationCursor = {
  updatedAt: number
  id: string
}

const conversationCursorPattern = /^(\d{1,16}):([0-9a-f-]{36})$/i
const LIST_PAGE_SIZE = 10
const LAST_MESSAGE_SELECT = `
  (SELECT role FROM messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_role,
  (SELECT content FROM messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_content,
  (SELECT created_at FROM messages m
    WHERE m.conversation_id = c.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_message_at
`

type AdminConversationRow = {
  id: string
  visitor_id: string
  status: ConversationStatus
  updated_at: number
  message_count: number
  last_message_role: ChatRole | null
  last_message_content: string | null
  last_message_at: number | null
}

export function encodeConversationCursor(item: AdminConversationListItem): string {
  return `${item.updatedAt}:${item.id}`
}

export function decodeConversationCursor(value: string): AdminConversationCursor | null {
  const match = conversationCursorPattern.exec(value)
  if (!match) return null

  return { updatedAt: Number(match[1]), id: match[2] }
}

function toListItem(row: AdminConversationRow): AdminConversationListItem {
  return {
    id: row.id,
    visitorId: row.visitor_id,
    status: row.status,
    updatedAt: row.updated_at,
    visitorMessageCount: row.message_count,
    lastMessage:
      row.last_message_content !== null &&
      row.last_message_role !== null &&
      row.last_message_at !== null
        ? {
            role: row.last_message_role,
            content: row.last_message_content,
            createdAt: row.last_message_at,
          }
        : null,
  }
}

export async function listConversations(
  db: D1Database,
  filter: AdminConversationFilter = 'all',
  cursor: AdminConversationCursor | null = null,
  limit: number = LIST_PAGE_SIZE
): Promise<AdminConversationPage> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 20)

  const statusFiltered = filter === 'open' || filter === 'closed'
  const base = `
    SELECT c.id, c.visitor_id, c.status, c.updated_at, c.message_count, ${LAST_MESSAGE_SELECT}
    FROM conversations c
  `
  const orderClause = 'ORDER BY c.updated_at DESC, c.id DESC LIMIT ?'
  const cursorClause = '(c.updated_at < ? OR (c.updated_at = ? AND c.id < ?))'

  const statement = statusFiltered
    ? db.prepare(`${base} WHERE c.status = ? ${cursor ? `AND ${cursorClause} ` : ''}${orderClause}`)
    : db.prepare(`${base} ${cursor ? `WHERE ${cursorClause} ` : ''}${orderClause}`)

  // D1's bind() returns a new bound statement, so the return value must be kept
  const bound =
    statusFiltered && cursor
      ? statement.bind(filter, cursor.updatedAt, cursor.updatedAt, cursor.id, safeLimit + 1)
      : statusFiltered
        ? statement.bind(filter, safeLimit + 1)
        : cursor
          ? statement.bind(cursor.updatedAt, cursor.updatedAt, cursor.id, safeLimit + 1)
          : statement.bind(safeLimit + 1)

  const result = await bound.all<AdminConversationRow>()
  const hasMore = result.results.length > safeLimit
  const rows = result.results.slice(0, safeLimit)
  const conversations = rows.map(toListItem)

  return {
    conversations,
    hasMore,
    nextCursor:
      hasMore && conversations.at(-1) ? encodeConversationCursor(conversations.at(-1)!) : null,
  }
}

export async function getConversationById(
  db: D1Database,
  conversationId: string
): Promise<ConversationRow | null> {
  return db
    .prepare(
      `SELECT id, visitor_id, status, last_page_url, created_at, updated_at
       FROM conversations WHERE id = ? LIMIT 1`
    )
    .bind(conversationId)
    .first<ConversationRow>()
}

export type OwnerMessageResult =
  | { ok: true; conversation: ConversationRow; message: MessageRow; created: boolean }
  | { ok: false; reason: 'not_found' | 'closed' }

function assertOwnerIdempotencyMatch(
  existing: Awaited<ReturnType<typeof findChatMessageByClientMessageId>>,
  conversationId: string,
  content: string
): asserts existing is NonNullable<Awaited<ReturnType<typeof findChatMessageByClientMessageId>>> {
  if (
    !existing ||
    existing.message.role !== 'owner' ||
    existing.message.conversation_id !== conversationId ||
    existing.message.content !== content
  ) {
    throw new ChatIdempotencyConflictError()
  }
}

export async function persistOwnerMessage(
  db: D1Database,
  conversationId: string,
  content: string,
  clientMessageId: string
): Promise<OwnerMessageResult> {
  const currentConversation = await getConversationById(db, conversationId)
  if (!currentConversation) return { ok: false, reason: 'not_found' }
  if (currentConversation.status !== 'open') return { ok: false, reason: 'closed' }

  const existing = await findChatMessageByClientMessageId(db, clientMessageId)
  if (existing) {
    assertOwnerIdempotencyMatch(existing, conversationId, content)
    if (existing.conversation.status !== 'open') return { ok: false, reason: 'closed' }
    return {
      ok: true,
      conversation: existing.conversation,
      message: existing.message,
      created: false,
    }
  }

  const now = Date.now()
  const message: MessageRow = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    role: 'owner',
    content,
    page_url: null,
    created_at: now,
    client_message_id: clientMessageId,
  }

  let results: D1Result<unknown>[]
  try {
    // Keep the open-status check inside the same D1 batch as the write so a
    // visitor close between a pre-read and INSERT cannot land a reply on a
    // closed conversation. INSERT...SELECT matches 0 rows when missing/closed.
    results = await db.batch([
      db
        .prepare(
          `INSERT INTO messages (
             id, conversation_id, role, content, page_url, created_at, client_message_id
           )
           SELECT ?, id, ?, ?, ?, ?, ?
           FROM conversations
           WHERE id = ? AND status = 'open'
           RETURNING id`
        )
        .bind(
          message.id,
          message.role,
          message.content,
          null,
          message.created_at,
          clientMessageId,
          conversationId
        ),
      db
        .prepare(
          `UPDATE conversations
           SET updated_at = ?
           WHERE id = ? AND status = 'open'
           RETURNING id`
        )
        .bind(now, conversationId),
    ])
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    const raced = await findChatMessageByClientMessageId(db, clientMessageId)
    if (!raced) throw error
    assertOwnerIdempotencyMatch(raced, conversationId, content)
    if (raced.conversation.status !== 'open') return { ok: false, reason: 'closed' }
    return {
      ok: true,
      conversation: raced.conversation,
      message: raced.message,
      created: false,
    }
  }

  const insertedId = (results[0]?.results?.[0] as { id?: string } | undefined)?.id
  const updatedId = (results[1]?.results?.[0] as { id?: string } | undefined)?.id
  if (insertedId !== message.id || updatedId !== conversationId) {
    const conversation = await getConversationById(db, conversationId)
    if (!conversation) return { ok: false, reason: 'not_found' }
    if (conversation.status !== 'open') return { ok: false, reason: 'closed' }
    throw new Error('OWNER_MESSAGE_INSERT_FAILED')
  }

  const conversation = await getConversationById(db, conversationId)
  if (!conversation) return { ok: false, reason: 'not_found' }

  return { ok: true, conversation, message, created: true }
}
