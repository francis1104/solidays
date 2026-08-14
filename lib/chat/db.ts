import type { ChatMessageInput, ConversationRow, MessageRow } from './types'

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

export async function listMessages(db: D1Database, conversationId: string): Promise<MessageRow[]> {
  const result = await db
    .prepare(
      `SELECT id, conversation_id, role, content, page_url, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .bind(conversationId)
    .all<MessageRow>()

  return result.results
}

export async function loadOpenConversation(
  db: D1Database,
  visitorId: string
): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const conversation = await findOpenConversation(db, visitorId)
  if (!conversation) return null

  return {
    conversation,
    messages: await listMessages(db, conversation.id),
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
  ])

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
