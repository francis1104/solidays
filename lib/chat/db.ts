import type { ChatMessageInput, ConversationRow, MessageRow } from './types'
import { CHAT_LIMITS } from './limits'

export class ChatQuotaExceededError extends Error {
  constructor() {
    super('CHAT_QUOTA_EXCEEDED')
    this.name = 'ChatQuotaExceededError'
  }
}

function isQuotaExceededError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('CHAT_QUOTA_EXCEEDED')
}

export async function findVisitor(db: D1Database, visitorId: string): Promise<string | null> {
  const row = await db
    .prepare('SELECT id FROM visitors WHERE id = ? LIMIT 1')
    .bind(visitorId)
    .first<{ id: string }>()

  return row?.id ?? null
}

export async function findOpenConversation(
  db: D1Database,
  visitorId: string
): Promise<ConversationRow | null> {
  return db
    .prepare(
      `SELECT id, visitor_id, status, last_page_url, created_at, updated_at
       FROM conversations
       WHERE visitor_id = ? AND status = 'open'
       LIMIT 1`
    )
    .bind(visitorId)
    .first<ConversationRow>()
}

export type MessageCursor = {
  createdAt: number
  id: string
}

export type MessagePage = {
  messages: MessageRow[]
  hasMore: boolean
  nextCursor: string | null
}

const cursorPattern = /^(\d{1,16}):([0-9a-f-]{36})$/i

export function encodeMessageCursor(message: MessageRow): string {
  return `${message.created_at}:${message.id}`
}

export function decodeMessageCursor(value: string): MessageCursor | null {
  const match = cursorPattern.exec(value)
  if (!match) return null

  return {
    createdAt: Number(match[1]),
    id: match[2],
  }
}

export async function listMessages(
  db: D1Database,
  conversationId: string,
  cursor: MessageCursor | null = null,
  limit: number = CHAT_LIMITS.historyPageSize
): Promise<MessagePage> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), CHAT_LIMITS.historyPageSize)
  const result = cursor
    ? await db
        .prepare(
          `SELECT id, conversation_id, role, content, page_url, created_at
           FROM messages
           WHERE conversation_id = ?
             AND (
               created_at < ? OR
               (created_at = ? AND id < ?)
             )
           ORDER BY created_at DESC, id DESC
           LIMIT ?`
        )
        .bind(conversationId, cursor.createdAt, cursor.createdAt, cursor.id, safeLimit + 1)
        .all<MessageRow>()
    : await db
        .prepare(
          `SELECT id, conversation_id, role, content, page_url, created_at
           FROM messages
           WHERE conversation_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ?`
        )
        .bind(conversationId, safeLimit + 1)
        .all<MessageRow>()

  const hasMore = result.results.length > safeLimit
  const messages = result.results.slice(0, safeLimit).reverse()

  return {
    messages,
    hasMore,
    nextCursor: hasMore && messages[0] ? encodeMessageCursor(messages[0]) : null,
  }
}

export async function loadOpenConversation(
  db: D1Database,
  visitorId: string,
  cursor: MessageCursor | null = null,
  limit: number = CHAT_LIMITS.historyPageSize
): Promise<{ conversation: ConversationRow; messages: MessagePage } | null> {
  const conversation = await findOpenConversation(db, visitorId)
  if (!conversation) return null

  return {
    conversation,
    messages: await listMessages(db, conversation.id, cursor, limit),
  }
}

async function appendToConversation(
  db: D1Database,
  conversation: ConversationRow,
  input: ChatMessageInput,
  visitorId: string,
  now: number
) {
  const message: MessageRow = {
    id: crypto.randomUUID(),
    conversation_id: conversation.id,
    role: 'visitor',
    content: input.content,
    page_url: input.pageUrl,
    created_at: now,
  }

  try {
    await db.batch([
      db
        .prepare('INSERT OR IGNORE INTO visitors (id, created_at, last_seen_at) VALUES (?, ?, ?)')
        .bind(visitorId, now, now),
      db
        .prepare(
          `INSERT INTO messages (id, conversation_id, role, content, page_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          message.id,
          message.conversation_id,
          message.role,
          message.content,
          message.page_url,
          message.created_at
        ),
      db
        .prepare(
          `UPDATE conversations
           SET updated_at = ?, last_page_url = COALESCE(?, last_page_url)
           WHERE id = ? AND status = 'open'`
        )
        .bind(now, input.pageUrl, conversation.id),
      db.prepare('UPDATE visitors SET last_seen_at = ? WHERE id = ?').bind(now, visitorId),
    ])
  } catch (error) {
    if (isQuotaExceededError(error)) throw new ChatQuotaExceededError()
    throw error
  }

  return {
    conversation: {
      ...conversation,
      last_page_url: input.pageUrl ?? conversation.last_page_url,
      updated_at: now,
    },
    message,
  }
}

export async function persistVisitorMessage(
  db: D1Database,
  visitorId: string,
  input: ChatMessageInput
): Promise<{ conversation: ConversationRow; message: MessageRow }> {
  const existing = await findOpenConversation(db, visitorId)
  const now = Date.now()

  if (existing) return appendToConversation(db, existing, input, visitorId, now)

  const conversation: ConversationRow = {
    id: crypto.randomUUID(),
    visitor_id: visitorId,
    status: 'open',
    last_page_url: input.pageUrl,
    created_at: now,
    updated_at: now,
  }
  const message: MessageRow = {
    id: crypto.randomUUID(),
    conversation_id: conversation.id,
    role: 'visitor',
    content: input.content,
    page_url: input.pageUrl,
    created_at: now,
  }

  try {
    await db.batch([
      db
        .prepare('INSERT OR IGNORE INTO visitors (id, created_at, last_seen_at) VALUES (?, ?, ?)')
        .bind(visitorId, now, now),
      db
        .prepare(
          `INSERT INTO conversations (id, visitor_id, status, last_page_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          conversation.id,
          conversation.visitor_id,
          conversation.status,
          conversation.last_page_url,
          conversation.created_at,
          conversation.updated_at
        ),
      db
        .prepare(
          `INSERT INTO messages (id, conversation_id, role, content, page_url, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(
          message.id,
          message.conversation_id,
          message.role,
          message.content,
          message.page_url,
          message.created_at
        ),
    ])

    return { conversation, message }
  } catch (error) {
    if (isQuotaExceededError(error)) throw new ChatQuotaExceededError()

    const concurrent = await findOpenConversation(db, visitorId)
    if (!concurrent) throw error

    return appendToConversation(db, concurrent, input, visitorId, Date.now())
  }
}

export async function closeOpenConversation(db: D1Database, visitorId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE conversations
       SET status = 'closed', updated_at = ?
       WHERE visitor_id = ? AND status = 'open'`
    )
    .bind(Date.now(), visitorId)
    .run()
}

export async function purgeExpiredChatData(
  db: D1Database,
  now = Date.now()
): Promise<{ conversations: number }> {
  const closedCutoff = now - CHAT_LIMITS.closedConversationRetentionMs
  const staleOpenCutoff = now - CHAT_LIMITS.staleOpenConversationRetentionMs
  const expiredConversationIds = `
    SELECT id
    FROM conversations
    WHERE (status = 'closed' AND updated_at < ?)
       OR (status = 'open' AND updated_at < ?)
    ORDER BY updated_at ASC
    LIMIT ?`

  const results = await db.batch([
    db
      .prepare(`DELETE FROM messages WHERE conversation_id IN (${expiredConversationIds})`)
      .bind(closedCutoff, staleOpenCutoff, CHAT_LIMITS.purgeBatchSize),
    db
      .prepare(`DELETE FROM conversations WHERE id IN (${expiredConversationIds})`)
      .bind(closedCutoff, staleOpenCutoff, CHAT_LIMITS.purgeBatchSize),
    db
      .prepare(
        `DELETE FROM visitors
         WHERE NOT EXISTS (
           SELECT 1 FROM conversations WHERE conversations.visitor_id = visitors.id
         )`
      )
      .bind(),
  ])

  return { conversations: results[1].meta.changes ?? 0 }
}
