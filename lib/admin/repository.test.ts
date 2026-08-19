import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ChatIdempotencyConflictError,
} from '../chat/repository.ts'
import type { ConversationRow, MessageRow } from '../chat/types.ts'
import { persistOwnerMessage } from './repository.ts'

type FakeStatement = {
  query: string
  values: unknown[]
  bind: (...values: unknown[]) => FakeStatement
  first: <T>() => Promise<T | null>
}

type FakeResult = { results: unknown[]; meta: { changes: number; last_row_id: number } }

const OWNER_CLIENT_MESSAGE_ID = '99999999-9999-4999-8999-999999999999'

class FakeAdminD1 {
  conversations = new Map<string, ConversationRow>()
  messages: MessageRow[] = []
  conversationReads: ConversationRow['status'][] = []
  private ownerBatchCalls = 0
  private releaseOwnerBatch: (() => void) | null = null
  private readonly ownerBatchBarrier: Promise<void>
  private readonly barrierEnabled: boolean
  private closeConversationBeforeIdempotencyLookup: string | null = null

  constructor(barrierEnabled = false) {
    this.barrierEnabled = barrierEnabled
    this.ownerBatchBarrier = new Promise<void>((resolve) => {
      this.releaseOwnerBatch = resolve
    })
  }

  armCloseBeforeIdempotencyLookup(conversationId: string): void {
    this.closeConversationBeforeIdempotencyLookup = conversationId
  }

  prepare(query: string): FakeStatement {
    const statement: FakeStatement = {
      query,
      values: [],
      bind: (...values) => {
        statement.values = values
        return statement
      },
      first: async <T>() => {
        if (query.includes('FROM messages m')) {
          if (this.closeConversationBeforeIdempotencyLookup) {
            const conversation = this.conversations.get(this.closeConversationBeforeIdempotencyLookup)
            if (conversation) conversation.status = 'closed'
            this.closeConversationBeforeIdempotencyLookup = null
          }

          const clientMessageId = String(statement.values[0])
          const message = this.messages.find(
            (candidate) => candidate.client_message_id === clientMessageId
          )
          if (!message) return null
          const conversation = this.conversations.get(message.conversation_id)
          if (!conversation) return null
          return {
            conversation_id: conversation.id,
            visitor_id: conversation.visitor_id,
            conversation_status: conversation.status,
            last_page_url: conversation.last_page_url,
            conversation_created_at: conversation.created_at,
            conversation_updated_at: conversation.updated_at,
            message_id: message.id,
            message_role: message.role,
            message_content: message.content,
            message_page_url: message.page_url,
            message_created_at: message.created_at,
            client_message_id: message.client_message_id,
          } as T
        }

        if (query.includes('FROM conversations')) {
          const conversation = this.conversations.get(String(statement.values[0]))
          if (conversation) this.conversationReads.push(conversation.status)
          return (conversation ? { ...conversation } : null) as T | null
        }

        return null
      },
    }
    return statement
  }

  async batch(statements: FakeStatement[]): Promise<FakeResult[]> {
    if (
      this.barrierEnabled &&
      statements.some((statement) => statement.query.includes('INSERT INTO messages'))
    ) {
      this.ownerBatchCalls += 1
      if (this.ownerBatchCalls === 1) {
        await this.ownerBatchBarrier
      } else if (this.ownerBatchCalls === 2) {
        this.releaseOwnerBatch?.()
      }
    }

    return statements.map((statement) => {
      const { query, values } = statement
      if (query.includes('INSERT INTO messages')) {
        const clientMessageId = String(values[5])
        if (this.messages.some((message) => message.client_message_id === clientMessageId)) {
          throw new Error('UNIQUE constraint failed: messages.client_message_id')
        }

        const message: MessageRow = {
          id: String(values[0]),
          conversation_id: String(values[6]),
          role: String(values[1]) as MessageRow['role'],
          content: String(values[2]),
          page_url: null,
          created_at: Number(values[4]),
          client_message_id: clientMessageId,
        }
        this.messages.push(message)
        return { results: [{ id: message.id }], meta: { changes: 0, last_row_id: 0 } }
      }

      if (query.includes('UPDATE conversations')) {
        const conversation = this.conversations.get(String(values[1]))
        if (!conversation || conversation.status !== 'open') {
          return { results: [], meta: { changes: 0, last_row_id: 0 } }
        }
        conversation.updated_at = Number(values[0])
        return { results: [{ id: conversation.id }], meta: { changes: 0, last_row_id: 0 } }
      }

      return { results: [], meta: { changes: 0, last_row_id: 0 } }
    })
  }
}

function addConversation(
  db: FakeAdminD1,
  id: string,
  status: ConversationRow['status'] = 'open'
): ConversationRow {
  const conversation: ConversationRow = {
    id,
    visitor_id: 'visitor-owner-test',
    status,
    last_page_url: '/admin-test',
    created_at: 1,
    updated_at: 1,
  }
  db.conversations.set(id, conversation)
  return conversation
}

test('concurrent owner commands with one client id create exactly one message', async () => {
  const db = new FakeAdminD1(true)
  const conversation = addConversation(db, 'conversation-owner-concurrent')

  const results = await Promise.all([
    persistOwnerMessage(
      db as unknown as D1Database,
      conversation.id,
      'concurrent owner reply',
      OWNER_CLIENT_MESSAGE_ID
    ),
    persistOwnerMessage(
      db as unknown as D1Database,
      conversation.id,
      'concurrent owner reply',
      OWNER_CLIENT_MESSAGE_ID
    ),
  ])

  assert.deepEqual(
    results.map((result) => (result.ok ? result.created : null)).sort(),
    [false, true]
  )
  assert.equal(results[0]?.ok && results[1]?.ok && results[0].message.id === results[1].message.id, true)
  assert.equal(db.messages.length, 1)
})

test('owner replay with a different payload is rejected without exposing the old message', async () => {
  const db = new FakeAdminD1()
  const conversation = addConversation(db, 'conversation-owner-conflict')

  await persistOwnerMessage(
    db as unknown as D1Database,
    conversation.id,
    'original owner reply',
    OWNER_CLIENT_MESSAGE_ID
  )

  await assert.rejects(
    persistOwnerMessage(
      db as unknown as D1Database,
      conversation.id,
      'different owner reply',
      OWNER_CLIENT_MESSAGE_ID
    ),
    ChatIdempotencyConflictError
  )
  assert.equal(db.messages.length, 1)
})

test('a visitor command id cannot be replayed as an owner command', async () => {
  const db = new FakeAdminD1()
  const conversation = addConversation(db, 'conversation-cross-role')
  db.messages.push({
    id: 'visitor-message-cross-role',
    conversation_id: conversation.id,
    role: 'visitor',
    content: 'visitor content',
    page_url: '/visitor',
    created_at: 2,
    client_message_id: OWNER_CLIENT_MESSAGE_ID,
  })

  await assert.rejects(
    persistOwnerMessage(
      db as unknown as D1Database,
      conversation.id,
      'visitor content',
      OWNER_CLIENT_MESSAGE_ID
    ),
    ChatIdempotencyConflictError
  )
  assert.equal(db.messages.length, 1)
})

test('closed owner conversations retain closed semantics on idempotent replay', async () => {
  const db = new FakeAdminD1()
  const conversation = addConversation(db, 'conversation-owner-closed', 'closed')
  db.messages.push({
    id: 'owner-message-closed',
    conversation_id: conversation.id,
    role: 'owner',
    content: 'already committed',
    page_url: null,
    created_at: 2,
    client_message_id: OWNER_CLIENT_MESSAGE_ID,
  })

  const result = await persistOwnerMessage(
    db as unknown as D1Database,
    conversation.id,
    'already committed',
    OWNER_CLIENT_MESSAGE_ID
  )

  assert.deepEqual(result, { ok: false, reason: 'closed' })
})

test('owner replay uses the closed conversation snapshot after a close between reads', async () => {
  const db = new FakeAdminD1()
  const conversation = addConversation(db, 'conversation-owner-stale-replay')
  db.messages.push({
    id: 'owner-message-stale-replay',
    conversation_id: conversation.id,
    role: 'owner',
    content: 'already committed before close',
    page_url: null,
    created_at: 2,
    client_message_id: OWNER_CLIENT_MESSAGE_ID,
  })
  db.armCloseBeforeIdempotencyLookup(conversation.id)

  const result = await persistOwnerMessage(
    db as unknown as D1Database,
    conversation.id,
    'already committed before close',
    OWNER_CLIENT_MESSAGE_ID
  )

  assert.deepEqual(db.conversationReads, ['open'])
  assert.deepEqual(result, { ok: false, reason: 'closed' })
  assert.equal(db.conversations.get(conversation.id)?.status, 'closed')
  assert.equal(db.messages.length, 1)
})
