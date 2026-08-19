import type { ChatMessageInput, ConversationRow, MessageRow } from './types.ts'
import { CHAT_LIMITS } from './limits.ts'

export class ChatQuotaExceededError extends Error {
  constructor() {
    super('CHAT_QUOTA_EXCEEDED')
    this.name = 'ChatQuotaExceededError'
  }
}

export class ChatWriteConflictError extends Error {
  constructor() {
    super('CHAT_WRITE_CONFLICT')
    this.name = 'ChatWriteConflictError'
  }
}

export class ChatIdempotencyConflictError extends Error {
  constructor() {
    super('CHAT_IDEMPOTENCY_CONFLICT')
    this.name = 'ChatIdempotencyConflictError'
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

type ReturnedIdRow = { id: string }

type VisitorMessageCommand = {
  messageId: string
  clientMessageId: string
  createdAt: number
}

export type PersistedVisitorMessage = {
  visitorId: string
  conversation: ConversationRow
  message: MessageRow
  created: boolean
}

type ExistingVisitorMessageRow = {
  conversation_id: string
  visitor_id: string
  conversation_status: ConversationRow['status']
  last_page_url: string | null
  conversation_created_at: number
  conversation_updated_at: number
  message_id: string
  message_role: MessageRow['role']
  message_content: string
  message_page_url: string | null
  message_created_at: number
  client_message_id: string
}

function toPersistedVisitorMessage(row: ExistingVisitorMessageRow): PersistedVisitorMessage {
  return {
    visitorId: row.visitor_id,
    conversation: {
      id: row.conversation_id,
      visitor_id: row.visitor_id,
      status: row.conversation_status,
      last_page_url: row.last_page_url,
      created_at: row.conversation_created_at,
      updated_at: row.conversation_updated_at,
    },
    message: {
      id: row.message_id,
      conversation_id: row.conversation_id,
      role: row.message_role,
      content: row.message_content,
      page_url: row.message_page_url,
      created_at: row.message_created_at,
      client_message_id: row.client_message_id,
    },
    created: false,
  }
}

export async function findChatMessageByClientMessageId(
  db: D1Database,
  clientMessageId: string
): Promise<PersistedVisitorMessage | null> {
  const row = await db
    .prepare(
      `SELECT
         c.id AS conversation_id,
         c.visitor_id,
         c.status AS conversation_status,
         c.last_page_url,
         c.created_at AS conversation_created_at,
         c.updated_at AS conversation_updated_at,
         m.id AS message_id,
         m.role AS message_role,
         m.content AS message_content,
         m.page_url AS message_page_url,
         m.created_at AS message_created_at,
         m.client_message_id
       FROM messages m
       INNER JOIN conversations c ON c.id = m.conversation_id
       WHERE m.client_message_id = ?
       LIMIT 1`
    )
    .bind(clientMessageId)
    .first<ExistingVisitorMessageRow>()

  return row ? toPersistedVisitorMessage(row) : null
}

export async function findVisitorMessageByClientMessageId(
  db: D1Database,
  clientMessageId: string,
  visitorId: string | null = null
): Promise<PersistedVisitorMessage | null> {
  const row = await findChatMessageByClientMessageId(db, clientMessageId)
  if (!row || (visitorId !== null && row.visitorId !== visitorId)) return null
  return row
}

function createVisitorMessageCommand(input: ChatMessageInput): VisitorMessageCommand {
  return {
    messageId: crypto.randomUUID(),
    clientMessageId: input.clientMessageId ?? crypto.randomUUID(),
    createdAt: Date.now(),
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT_UNIQUE')
  )
}

function assertVisitorIdempotencyMatch(
  existing: PersistedVisitorMessage,
  visitorId: string | null,
  content: string
): void {
  // pageUrl is request metadata, not command identity. Normalized content,
  // role, and visitor ownership define a visitor command.
  if (
    existing.message.role !== 'visitor' ||
    (visitorId !== null && existing.visitorId !== visitorId) ||
    existing.message.content !== content
  ) {
    throw new ChatIdempotencyConflictError()
  }
}

async function findMatchingVisitorMessage(
  db: D1Database,
  clientMessageId: string,
  visitorId: string | null,
  content: string
): Promise<PersistedVisitorMessage | null> {
  const existing = await findChatMessageByClientMessageId(db, clientMessageId)
  if (!existing) return null
  assertVisitorIdempotencyMatch(existing, visitorId, content)
  return existing
}

function isRetryableVisitorWriteError(error: unknown): boolean {
  return error instanceof ChatWriteConflictError || isUniqueConstraintError(error)
}

async function appendToConversation(
  db: D1Database,
  conversation: ConversationRow,
  input: ChatMessageInput,
  visitorId: string,
  command: VisitorMessageCommand
): Promise<PersistedVisitorMessage> {
  const message: MessageRow = {
    id: command.messageId,
    conversation_id: conversation.id,
    role: 'visitor',
    content: input.content,
    page_url: input.pageUrl,
    created_at: command.createdAt,
    client_message_id: command.clientMessageId,
  }

  try {
    const results = await db.batch([
      db
        .prepare('INSERT OR IGNORE INTO visitors (id, created_at, last_seen_at) VALUES (?, ?, ?)')
        .bind(visitorId, command.createdAt, command.createdAt),
      db
        .prepare(
          `UPDATE conversations
           SET updated_at = ?, last_page_url = COALESCE(?, last_page_url)
           WHERE id = ? AND visitor_id = ? AND status = 'open'
           RETURNING id`
        )
        .bind(command.createdAt, input.pageUrl, conversation.id, visitorId),
      db
        .prepare(
          `INSERT INTO messages (
             id, conversation_id, role, content, page_url, created_at, client_message_id
           )
           SELECT ?, id, ?, ?, ?, ?, ?
           FROM conversations
           WHERE id = ? AND visitor_id = ? AND status = 'open'
           RETURNING id`
        )
        .bind(
          message.id,
          message.role,
          message.content,
          message.page_url,
          message.created_at,
          message.client_message_id,
          conversation.id,
          visitorId
        ),
      db
        .prepare('UPDATE visitors SET last_seen_at = ? WHERE id = ?')
        .bind(command.createdAt, visitorId),
    ])

    const updatedId = (results[1]?.results?.[0] as ReturnedIdRow | undefined)?.id
    const insertedId = (results[2]?.results?.[0] as ReturnedIdRow | undefined)?.id
    if (updatedId !== conversation.id || insertedId !== message.id) {
      throw new ChatWriteConflictError()
    }
  } catch (error) {
    if (isQuotaExceededError(error)) throw new ChatQuotaExceededError()
    throw error
  }

  return {
    visitorId,
    conversation: {
      ...conversation,
      last_page_url: input.pageUrl ?? conversation.last_page_url,
      updated_at: command.createdAt,
    },
    message,
    created: true,
  }
}

const MAX_VISITOR_WRITE_ATTEMPTS = 2

async function createConversationWithMessage(
  db: D1Database,
  visitorId: string,
  input: ChatMessageInput,
  command: VisitorMessageCommand
): Promise<PersistedVisitorMessage> {
  const now = command.createdAt
  const conversation: ConversationRow = {
    id: crypto.randomUUID(),
    visitor_id: visitorId,
    status: 'open',
    last_page_url: input.pageUrl,
    created_at: now,
    updated_at: now,
  }
  const message: MessageRow = {
    id: command.messageId,
    conversation_id: conversation.id,
    role: 'visitor',
    content: input.content,
    page_url: input.pageUrl,
    created_at: now,
    client_message_id: command.clientMessageId,
  }

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
        `INSERT INTO messages (
           id, conversation_id, role, content, page_url, created_at, client_message_id
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        message.id,
        message.conversation_id,
        message.role,
        message.content,
        message.page_url,
        message.created_at,
        message.client_message_id
      ),
  ])

  return { visitorId, conversation, message, created: true }
}

export async function persistVisitorMessage(
  db: D1Database,
  visitorId: string | null,
  input: ChatMessageInput
): Promise<PersistedVisitorMessage> {
  const command = createVisitorMessageCommand(input)
  if (input.clientMessageId) {
    const existing = await findMatchingVisitorMessage(
      db,
      input.clientMessageId,
      visitorId,
      input.content
    )
    if (existing) return existing
  }

  const persistedVisitorId = visitorId ?? crypto.randomUUID()
  const idempotencyVisitorId = visitorId === null ? null : persistedVisitorId
  let lastConflict: ChatWriteConflictError | null = null

  for (let attempt = 0; attempt < MAX_VISITOR_WRITE_ATTEMPTS; attempt += 1) {
    const committed = await findMatchingVisitorMessage(
      db,
      command.clientMessageId,
      idempotencyVisitorId,
      input.content
    )
    if (committed) return committed

    const existing = await findOpenConversation(db, persistedVisitorId)

    if (existing) {
      try {
        return await appendToConversation(db, existing, input, persistedVisitorId, command)
      } catch (error) {
        if (!isRetryableVisitorWriteError(error)) throw error
        const committedAfterError = await findMatchingVisitorMessage(
          db,
          command.clientMessageId,
          idempotencyVisitorId,
          input.content
        )
        if (committedAfterError) return committedAfterError
        lastConflict = new ChatWriteConflictError()
        continue
      }
    }

    try {
      return await createConversationWithMessage(db, persistedVisitorId, input, command)
    } catch (error) {
      const committedAfterError = await findMatchingVisitorMessage(
        db,
        command.clientMessageId,
        idempotencyVisitorId,
        input.content
      )
      if (committedAfterError) return committedAfterError
      if (isQuotaExceededError(error)) throw new ChatQuotaExceededError()

      const concurrent = await findOpenConversation(db, persistedVisitorId)
      if (!concurrent) throw error
      try {
        return await appendToConversation(db, concurrent, input, persistedVisitorId, command)
      } catch (appendError) {
        if (!isRetryableVisitorWriteError(appendError)) throw appendError
        const committedAfterAppendError = await findMatchingVisitorMessage(
          db,
          command.clientMessageId,
          idempotencyVisitorId,
          input.content
        )
        if (committedAfterAppendError) return committedAfterAppendError
        lastConflict = new ChatWriteConflictError()
      }
    }
  }

  throw lastConflict ?? new ChatWriteConflictError()
}

export async function closeOpenConversation(
  db: D1Database,
  visitorId: string
): Promise<ConversationRow | null> {
  const conversation = await findOpenConversation(db, visitorId)
  if (!conversation) return null

  const now = Date.now()
  const result = await db
    .prepare(
      `UPDATE conversations
       SET status = 'closed', updated_at = ?
       WHERE id = ? AND visitor_id = ? AND status = 'open'
       RETURNING id`
    )
    .bind(now, conversation.id, visitorId)
    .first<{ id: string }>()

  if (result?.id !== conversation.id) return null

  return { ...conversation, status: 'closed', updated_at: now }
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
