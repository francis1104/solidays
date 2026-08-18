import assert from 'node:assert/strict'
import test from 'node:test'
import { persistVisitorMessage } from './repository.ts'
import type { ConversationRow, MessageRow } from './types.ts'

type FakeStatement = {
  query: string
  values: unknown[]
  bind: (...values: unknown[]) => FakeStatement
  first: <T>() => Promise<T | null>
}

type FakeResult = {
  results: unknown[]
  meta: { changes: number; last_row_id: number }
}

const TEST_CLIENT_MESSAGE_ID = '11111111-1111-4111-8111-111111111111'

function messageInput(content: string, clientMessageId = TEST_CLIENT_MESSAGE_ID) {
  return {
    content,
    pageUrl: '/new',
    turnstileToken: 'test-token',
    clientMessageId,
  }
}

class FakeD1 {
  conversations = new Map<string, ConversationRow>()
  messages: MessageRow[] = []
  visitors = new Set<string>()
  closeBeforeNextBatch = false
  raceBeforeCreateConversation: ConversationRow | null = null
  misleadingChanges = false
  omitReturningOnNextAppend = false

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
          const clientMessageId = String(statement.values[0])
          const visitorId = statement.values[1] ? String(statement.values[1]) : null
          const message = this.messages.find(
            (candidate) =>
              candidate.client_message_id === clientMessageId &&
              (visitorId === null ||
                this.conversations.get(candidate.conversation_id)?.visitor_id === visitorId)
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
          const visitorId = String(statement.values[0])
          const conversation = [...this.conversations.values()].find(
            (candidate) => candidate.visitor_id === visitorId && candidate.status === 'open'
          )
          return (conversation ?? null) as T | null
        }

        return null
      },
    }
    return statement
  }

  async batch(statements: FakeStatement[]): Promise<FakeResult[]> {
    if (this.closeBeforeNextBatch) {
      this.closeBeforeNextBatch = false
      const openConversation = [...this.conversations.values()].find(
        (conversation) => conversation.status === 'open'
      )
      if (openConversation) openConversation.status = 'closed'
    }

    if (
      this.raceBeforeCreateConversation &&
      statements.some((statement) => statement.query.includes('INSERT INTO conversations'))
    ) {
      this.conversations.set(
        this.raceBeforeCreateConversation.id,
        this.raceBeforeCreateConversation
      )
      this.raceBeforeCreateConversation = null
      throw new Error('UNIQUE constraint failed: conversations.visitor_id')
    }

    return statements.map((statement) => {
      const query = statement.query
      const values = statement.values
      let changes = 0
      let returned: unknown[] = []

      if (query.includes('INSERT OR IGNORE INTO visitors')) {
        const visitorId = String(values[0])
        if (!this.visitors.has(visitorId)) {
          this.visitors.add(visitorId)
          changes = 1
        }
      } else if (query.includes('UPDATE conversations')) {
        const conversationId = String(values[2] ?? values[1])
        const conversation = this.conversations.get(conversationId)
        if (conversation?.status === 'open') {
          conversation.updated_at = Number(values[0])
          if (values.length > 1 && typeof values[1] === 'string') {
            conversation.last_page_url = values[1]
          }
          changes = this.misleadingChanges ? 3 : 1
          returned = [{ id: conversation.id }]
        }
      } else if (query.includes('INSERT INTO messages') && query.includes('SELECT')) {
        const messageId = String(values[0])
        const conversationId = String(values[6])
        const clientMessageId = String(values[5])
        const conversation = this.conversations.get(conversationId)
        if (this.messages.some((message) => message.client_message_id === clientMessageId)) {
          throw new Error('UNIQUE constraint failed: messages.client_message_id')
        }
        if (conversation?.status === 'open') {
          this.messages.push({
            id: messageId,
            conversation_id: conversationId,
            role: String(values[1]) as MessageRow['role'],
            content: String(values[2]),
            page_url: (values[3] as string | null) ?? null,
            created_at: Number(values[4]),
            client_message_id: clientMessageId,
          })
          changes = this.misleadingChanges ? 3 : 1
          if (this.omitReturningOnNextAppend) {
            this.omitReturningOnNextAppend = false
          } else {
            returned = [{ id: messageId }]
          }
        }
      } else if (query.includes('INSERT INTO conversations')) {
        const conversation: ConversationRow = {
          id: String(values[0]),
          visitor_id: String(values[1]),
          status: String(values[2]) as ConversationRow['status'],
          last_page_url: (values[3] as string | null) ?? null,
          created_at: Number(values[4]),
          updated_at: Number(values[5]),
        }
        this.conversations.set(conversation.id, conversation)
        changes = 1
      } else if (query.includes('INSERT INTO messages') && query.includes('VALUES')) {
        const clientMessageId = String(values[6])
        if (this.messages.some((message) => message.client_message_id === clientMessageId)) {
          throw new Error('UNIQUE constraint failed: messages.client_message_id')
        }
        this.messages.push({
          id: String(values[0]),
          conversation_id: String(values[1]),
          role: String(values[2]) as MessageRow['role'],
          content: String(values[3]),
          page_url: (values[4] as string | null) ?? null,
          created_at: Number(values[5]),
          client_message_id: clientMessageId,
        })
        changes = 1
      } else if (query.includes('UPDATE visitors')) {
        changes = 1
      }

      return {
        results: returned,
        meta: { changes, last_row_id: 0 },
      }
    })
  }
}

function addOpenConversation(db: FakeD1, visitorId: string, id: string): ConversationRow {
  const conversation: ConversationRow = {
    id,
    visitor_id: visitorId,
    status: 'open',
    last_page_url: '/old',
    created_at: 1,
    updated_at: 1,
  }
  db.conversations.set(conversation.id, conversation)
  db.visitors.add(visitorId)
  return conversation
}

test('visitor append never inserts into a conversation closed after the pre-read', async () => {
  const db = new FakeD1()
  const visitorId = 'visitor-1'
  const oldConversation = addOpenConversation(db, visitorId, 'conversation-old')
  db.closeBeforeNextBatch = true

  const result = await persistVisitorMessage(
    db as unknown as D1Database,
    visitorId,
    messageInput('after close')
  )

  assert.notEqual(result.conversation.id, oldConversation.id)
  assert.equal(oldConversation.status, 'closed')
  assert.equal(
    db.messages.some((message) => message.conversation_id === oldConversation.id),
    false
  )
  assert.equal(result.conversation.status, 'open')
  assert.equal(result.created, true)
  assert.deepEqual(
    db.messages
      .filter((message) => message.conversation_id === result.conversation.id)
      .map((message) => message.content),
    ['after close']
  )
})

test('visitor write converges on a concurrent conversation created after a close conflict', async () => {
  const db = new FakeD1()
  const visitorId = 'visitor-2'
  const oldConversation = addOpenConversation(db, visitorId, 'conversation-old-2')
  const concurrentConversation: ConversationRow = {
    id: 'conversation-concurrent-2',
    visitor_id: visitorId,
    status: 'open',
    last_page_url: '/concurrent',
    created_at: 2,
    updated_at: 2,
  }
  db.closeBeforeNextBatch = true
  db.raceBeforeCreateConversation = concurrentConversation

  const result = await persistVisitorMessage(
    db as unknown as D1Database,
    visitorId,
    messageInput('eventual append', '22222222-2222-4222-8222-222222222222')
  )

  assert.equal(oldConversation.status, 'closed')
  assert.equal(result.conversation.id, concurrentConversation.id)
  assert.deepEqual(
    db.messages.map((message) => ({ conversationId: message.conversation_id, content: message.content })),
    [{ conversationId: concurrentConversation.id, content: 'eventual append' }]
  )
  assert.equal(
    db.messages.some((message) => message.conversation_id === oldConversation.id),
    false
  )
})

test('visitor conditional writes use RETURNING ids even when meta.changes is not one', async () => {
  const db = new FakeD1()
  addOpenConversation(db, 'visitor-3', 'conversation-3')
  db.misleadingChanges = true

  const result = await persistVisitorMessage(
    db as unknown as D1Database,
    'visitor-3',
    messageInput('returning wins', '33333333-3333-4333-8333-333333333333')
  )

  assert.equal(result.created, true)
  assert.equal(db.messages.length, 1)
  assert.equal(result.message.content, 'returning wins')
})

test('a committed append found after a missing RETURNING result is not inserted again', async () => {
  const db = new FakeD1()
  addOpenConversation(db, 'visitor-4', 'conversation-4')
  db.omitReturningOnNextAppend = true

  const result = await persistVisitorMessage(
    db as unknown as D1Database,
    'visitor-4',
    messageInput('stable retry', '44444444-4444-4444-8444-444444444444')
  )

  assert.equal(result.created, false)
  assert.equal(db.messages.length, 1)
  assert.equal(db.messages[0]?.id, result.message.id)
  assert.equal(db.messages[0]?.client_message_id, '44444444-4444-4444-8444-444444444444')
})

test('repeating the same client message id returns the existing message', async () => {
  const db = new FakeD1()
  const visitorId = 'visitor-5'
  const input = messageInput('idempotent message', '55555555-5555-4555-8555-555555555555')

  const first = await persistVisitorMessage(db as unknown as D1Database, visitorId, input)
  const second = await persistVisitorMessage(db as unknown as D1Database, visitorId, input)

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(second.visitorId, visitorId)
  assert.equal(second.conversation.id, first.conversation.id)
  assert.equal(second.message.id, first.message.id)
  assert.equal(db.messages.length, 1)
})

test('a retry without the visitor cookie recovers the original visitor and message', async () => {
  const db = new FakeD1()
  const input = messageInput('recover visitor cookie', '66666666-6666-4666-8666-666666666666')

  const first = await persistVisitorMessage(db as unknown as D1Database, null, input)
  const second = await persistVisitorMessage(db as unknown as D1Database, null, input)

  assert.equal(first.created, true)
  assert.equal(second.created, false)
  assert.equal(second.visitorId, first.visitorId)
  assert.equal(second.message.id, first.message.id)
  assert.equal(db.messages.length, 1)
})
