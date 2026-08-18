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

class FakeD1 {
  conversations = new Map<string, ConversationRow>()
  messages: MessageRow[] = []
  visitors = new Set<string>()
  closeBeforeNextBatch = false
  raceBeforeCreateConversation: ConversationRow | null = null

  prepare(query: string): FakeStatement {
    const statement: FakeStatement = {
      query,
      values: [],
      bind: (...values) => {
        statement.values = values
        return statement
      },
      first: async <T>() => {
        if (!query.includes('FROM conversations')) return null
        const visitorId = String(statement.values[0])
        const conversation = [...this.conversations.values()].find(
          (candidate) => candidate.visitor_id === visitorId && candidate.status === 'open'
        )
        return (conversation ?? null) as T | null
      },
    }
    return statement
  }

  async batch(statements: FakeStatement[]) {
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
          changes = 1
        }
      } else if (query.includes('INSERT INTO messages') && query.includes('SELECT')) {
        const messageId = String(values[0])
        const conversationId = String(values[5])
        const conversation = this.conversations.get(conversationId)
        if (conversation?.status === 'open') {
          this.messages.push({
            id: messageId,
            conversation_id: conversationId,
            role: String(values[1]) as MessageRow['role'],
            content: String(values[2]),
            page_url: (values[3] as string | null) ?? null,
            created_at: Number(values[4]),
          })
          changes = 1
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
        this.messages.push({
          id: String(values[0]),
          conversation_id: String(values[1]),
          role: String(values[2]) as MessageRow['role'],
          content: String(values[3]),
          page_url: (values[4] as string | null) ?? null,
          created_at: Number(values[5]),
        })
        changes = 1
      } else if (query.includes('UPDATE visitors')) {
        changes = 1
      }

      return { success: true, meta: { changes, last_row_id: 0 } }
    })
  }
}

test('visitor append never inserts into a conversation closed after the pre-read', async () => {
  const db = new FakeD1()
  const visitorId = 'visitor-1'
  const oldConversation: ConversationRow = {
    id: 'conversation-old',
    visitor_id: visitorId,
    status: 'open',
    last_page_url: '/old',
    created_at: 1,
    updated_at: 1,
  }
  db.conversations.set(oldConversation.id, oldConversation)
  db.visitors.add(visitorId)
  db.closeBeforeNextBatch = true

  const result = await persistVisitorMessage(db as unknown as D1Database, visitorId, {
    content: 'after close',
    pageUrl: '/new',
    turnstileToken: 'test-token',
  })

  assert.notEqual(result.conversation.id, oldConversation.id)
  assert.equal(oldConversation.status, 'closed')
  assert.equal(
    db.messages.some((message) => message.conversation_id === oldConversation.id),
    false
  )
  assert.equal(result.conversation.status, 'open')
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
  const oldConversation: ConversationRow = {
    id: 'conversation-old-2',
    visitor_id: visitorId,
    status: 'open',
    last_page_url: '/old',
    created_at: 1,
    updated_at: 1,
  }
  const concurrentConversation: ConversationRow = {
    id: 'conversation-concurrent-2',
    visitor_id: visitorId,
    status: 'open',
    last_page_url: '/concurrent',
    created_at: 2,
    updated_at: 2,
  }
  db.conversations.set(oldConversation.id, oldConversation)
  db.visitors.add(visitorId)
  db.closeBeforeNextBatch = true
  db.raceBeforeCreateConversation = concurrentConversation

  const result = await persistVisitorMessage(db as unknown as D1Database, visitorId, {
    content: 'eventual append',
    pageUrl: '/new',
    turnstileToken: 'test-token',
  })

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
