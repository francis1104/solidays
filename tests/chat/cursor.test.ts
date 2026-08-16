import { describe, expect, it } from 'vitest'
import { decodeMessageCursor, encodeMessageCursor } from '@/lib/chat/db'
import type { MessageRow } from '@/lib/chat/types'

const message: MessageRow = {
  id: '0f4d3c2a-1b2c-4d5e-8f9a-3c4b5a6d7e8f',
  conversation_id: 'conv-1',
  role: 'visitor',
  content: 'hello',
  page_url: null,
  created_at: 1725000000000,
}

describe('message cursor', () => {
  it('round-trips encode and decode', () => {
    const encoded = encodeMessageCursor(message)
    expect(decodeMessageCursor(encoded)).toEqual({
      createdAt: message.created_at,
      id: message.id,
    })
  })

  it('rejects malformed cursors', () => {
    expect(decodeMessageCursor('nonsense')).toBeNull()
    expect(decodeMessageCursor('12:not-a-uuid')).toBeNull()
    expect(decodeMessageCursor(':')).toBeNull()
    expect(decodeMessageCursor('')).toBeNull()
  })

  it('rejects timestamps longer than 16 digits', () => {
    const cursor = `12345678901234567:${message.id}`
    expect(decodeMessageCursor(cursor)).toBeNull()
  })
})
