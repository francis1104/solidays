import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSocketClosedLog, buildSocketErrorLog, readSocketObservabilityContext } from './realtime-observability.ts'

const attachment = {
  audience: 'visitor' as const,
  conversationId: 'conversation-observability',
}

test('socket close observability includes the attachment identity and close fields', () => {
  const log = buildSocketClosedLog(
    { deserializeAttachment: () => attachment },
    1000,
    'Realtime subscription closed',
    true
  )

  assert.deepEqual(log, {
    event: 'chat.realtime.socket_closed',
    conversationId: 'conversation-observability',
    audience: 'visitor',
    code: 1000,
    reason: 'Realtime subscription closed',
    wasClean: true,
  })
})

test('socket error observability includes the attachment identity', () => {
  const log = buildSocketErrorLog(
    { deserializeAttachment: () => ({ ...attachment, audience: 'admin' as const }) },
    new Error('socket transport failed')
  )

  assert.deepEqual(log, {
    event: 'chat.realtime.socket_error',
    conversationId: 'conversation-observability',
    audience: 'admin',
    error: 'socket transport failed',
  })
})

test('malformed or throwing attachments produce null identity without throwing', () => {
  const malformed = { deserializeAttachment: () => ({ conversationId: 'missing-audience' }) }
  const throwing = { deserializeAttachment: () => { throw new Error('bad attachment') } }

  assert.deepEqual(readSocketObservabilityContext(malformed), {
    conversationId: null,
    audience: null,
  })
  assert.deepEqual(
    buildSocketClosedLog(throwing, 1011, 'Realtime connection error', false),
    {
      event: 'chat.realtime.socket_closed',
      conversationId: null,
      audience: null,
      code: 1011,
      reason: 'Realtime connection error',
      wasClean: false,
    }
  )
  assert.deepEqual(buildSocketErrorLog(throwing, 'bad socket'), {
    event: 'chat.realtime.socket_error',
    conversationId: null,
    audience: null,
    error: 'bad socket',
  })
})
