import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const origin = 'http://localhost:8787'
const yarnPath = '.yarn/releases/yarn-3.6.1.cjs'
const localPersistTo = process.env.CHAT_LOCAL_PERSIST_TO

function getCookie(response) {
  const cookies = response.headers.getSetCookie?.() ?? []
  return cookies[0]?.split(';', 1)[0] ?? null
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('origin', origin)
  const response = await fetch(`${origin}${path}`, { ...options, headers })
  const body = await response.json().catch(() => null)
  return { response, body, cookie: getCookie(response) }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function queryLocalD1(sql) {
  const output = execFileSync(
    process.execPath,
    [
      yarnPath,
      'wrangler',
      'd1',
      'execute',
      'solidays-chat',
      '--local',
      '--config',
      'wrangler.jsonc',
      '--json',
      ...(localPersistTo ? ['--persist-to', localPersistTo] : []),
      '--command',
      sql,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )
  const parsed = JSON.parse(output)
  return parsed[0]?.results ?? parsed.results ?? []
}

function readLocalAdminPassword() {
  const devVars = readFileSync('.dev.vars', 'utf8')
  const match = /^ADMIN_PASSWORD=(.*)$/m.exec(devVars)
  assert(match?.[1], 'ADMIN_PASSWORD is not configured in .dev.vars')
  return match[1]
}

const visitorSeedId = crypto.randomUUID()
const visitorCommandId = crypto.randomUUID()
const visitorContent = `local visitor ${visitorCommandId}`
const seed = await request('/api/chat/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    content: visitorContent,
    pageUrl: '/local-idempotency-smoke',
    turnstileToken: 'local-test-token',
    clientMessageId: visitorSeedId,
  }),
})
assert(seed.response.status === 201, `visitor seed failed with ${seed.response.status}`)
const visitorCookie = seed.cookie
assert(visitorCookie, 'visitor seed did not set a cookie')

const visitorDuplicate = await Promise.all([
  request('/api/chat/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: visitorCookie },
    body: JSON.stringify({
      content: visitorContent,
      pageUrl: '/local-idempotency-smoke',
      turnstileToken: 'local-test-token',
      clientMessageId: visitorCommandId,
    }),
  }),
  request('/api/chat/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: visitorCookie },
    body: JSON.stringify({
      content: visitorContent,
      pageUrl: '/local-idempotency-smoke',
      turnstileToken: 'local-test-token',
      clientMessageId: visitorCommandId,
    }),
  }),
])
assert(
  visitorDuplicate.map(({ response }) => response.status).sort().join(',') === '200,201',
  `visitor concurrent statuses were ${visitorDuplicate.map(({ response }) => response.status).join(',')}`
)

const visitorHistory = await request('/api/chat/conversation', {
  headers: { cookie: visitorCookie },
})
assert(visitorHistory.response.status === 200, 'visitor history failed')
const conversationId = visitorHistory.body?.conversation?.id
assert(typeof conversationId === 'string', 'visitor conversation was not created')

const login = await request('/api/admin/session', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ key: readLocalAdminPassword() }),
})
assert(login.response.status === 200, `admin login failed with ${login.response.status}`)
const adminCookie = login.cookie
assert(adminCookie, 'admin login did not set a cookie')

const ownerCommandId = crypto.randomUUID()
const ownerContent = `local owner ${ownerCommandId}`
const ownerDuplicate = await Promise.all([
  request(`/api/admin/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ content: ownerContent, clientMessageId: ownerCommandId }),
  }),
  request(`/api/admin/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ content: ownerContent, clientMessageId: ownerCommandId }),
  }),
])
assert(
  ownerDuplicate.map(({ response }) => response.status).sort().join(',') === '200,201',
  `owner concurrent statuses were ${ownerDuplicate.map(({ response }) => response.status).join(',')}`
)

const ownerConflict = await request(`/api/admin/conversations/${conversationId}/messages`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: adminCookie },
  body: JSON.stringify({
    content: 'different owner payload',
    clientMessageId: ownerCommandId,
  }),
})
assert(ownerConflict.response.status === 409, 'owner payload conflict did not return 409')
assert(ownerConflict.body?.error?.code === 'IDEMPOTENCY_KEY_REUSED', 'owner conflict code changed')
assert(
  !JSON.stringify(ownerConflict.body).includes(ownerContent),
  'owner conflict response leaked the original message'
)

const quote = (value) => `'${value.replaceAll("'", "''")}'`
const visitorRows = queryLocalD1(
  `SELECT COUNT(*) AS count FROM messages WHERE client_message_id = ${quote(visitorCommandId)}`
)
const ownerRows = queryLocalD1(
  `SELECT COUNT(*) AS count FROM messages WHERE client_message_id = ${quote(ownerCommandId)}`
)
// Migration 0003 intentionally keeps the quota counters visitor-only so owner
// replies do not consume the visitor quota. Keep the counter invariant strict
// against the rows that the counter is defined to track, while also reporting
// the total conversation rows for diagnosis.
const conversationCounts = queryLocalD1(
  `SELECT
     c.message_count,
     (SELECT COUNT(*)
        FROM messages
       WHERE conversation_id = c.id AND role = 'visitor') AS actual_visitor_count,
     (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) AS total_count,
     v.message_count AS visitor_message_count,
     (SELECT COUNT(*)
        FROM messages m
        INNER JOIN conversations c2 ON c2.id = m.conversation_id
       WHERE c2.visitor_id = c.visitor_id AND m.role = 'visitor') AS visitor_actual_count
   FROM conversations c
   INNER JOIN visitors v ON v.id = c.visitor_id
   WHERE c.id = ${quote(conversationId)}`
)
assert(Number(visitorRows[0]?.count) === 1, 'visitor idempotency key produced more than one row')
assert(Number(ownerRows[0]?.count) === 1, 'owner idempotency key produced more than one row')
assert(
  Number(conversationCounts[0]?.message_count) ===
    Number(conversationCounts[0]?.actual_visitor_count),
  `conversation visitor message_count mismatch: stored=${conversationCounts[0]?.message_count}, actual visitor rows=${conversationCounts[0]?.actual_visitor_count}, total rows=${conversationCounts[0]?.total_count}`
)
assert(
  Number(conversationCounts[0]?.visitor_message_count) ===
    Number(conversationCounts[0]?.visitor_actual_count),
  `visitor message_count mismatch: stored=${conversationCounts[0]?.visitor_message_count}, actual=${conversationCounts[0]?.visitor_actual_count}`
)

await request('/api/chat/conversation/close', {
  method: 'POST',
  headers: { cookie: visitorCookie },
})

const visitorClosedReplay = await request('/api/chat/messages', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: visitorCookie },
  body: JSON.stringify({
    content: visitorContent,
    pageUrl: '/local-idempotency-smoke',
    turnstileToken: 'local-test-token',
    clientMessageId: visitorCommandId,
  }),
})
assert(visitorClosedReplay.response.status === 200, 'closed visitor replay did not return 200')
assert(visitorClosedReplay.body?.conversation?.status === 'closed', 'closed visitor replay reopened state')
assert(visitorClosedReplay.body?.realtimeEnabled === false, 'closed visitor replay re-enabled realtime')

const ownerClosedReplay = await request(
  `/api/admin/conversations/${conversationId}/messages`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: adminCookie },
    body: JSON.stringify({ content: ownerContent, clientMessageId: ownerCommandId }),
  }
)
assert(ownerClosedReplay.response.status === 409, 'closed owner replay did not return 409')
assert(ownerClosedReplay.body?.error?.code === 'CONVERSATION_CLOSED', 'closed owner replay code changed')

console.log('local D1 idempotency smoke passed: visitor 201+200, owner 201+200, one row per command')
