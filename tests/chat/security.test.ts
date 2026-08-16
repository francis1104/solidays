import { describe, expect, it } from 'vitest'
import { getClientIp, isAllowedOrigin, normalizePageUrl } from '@/lib/chat/security'

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers })
}

describe('isAllowedOrigin', () => {
  it('allows same-origin production requests over https', () => {
    const request = makeRequest('https://solidays.win/api/chat/messages', {
      origin: 'https://solidays.win',
    })
    expect(isAllowedOrigin(request)).toBe(true)
  })

  it('rejects missing origin header', () => {
    const request = makeRequest('https://solidays.win/api/chat/messages')
    expect(isAllowedOrigin(request)).toBe(false)
  })

  it('rejects cross-origin requests', () => {
    const request = makeRequest('https://solidays.win/api/chat/messages', {
      origin: 'https://evil.example.com',
    })
    expect(isAllowedOrigin(request)).toBe(false)
  })

  it('allows matching localhost origins without the bypass flag', () => {
    const request = makeRequest('http://127.0.0.1:3000/api/chat/messages', {
      origin: 'http://127.0.0.1:3000',
    })
    expect(isAllowedOrigin(request)).toBe(true)
  })

  it('never widens the check for https traffic even with the bypass flag', () => {
    // 生产流量恒为 https；即使 CHAT_LOCAL_DEV 被误配，放宽分支也不能生效
    const crossOrigin = makeRequest('https://solidays.win/api/chat/messages', {
      origin: 'https://evil.example.com',
    })
    expect(isAllowedOrigin(crossOrigin, true)).toBe(false)
  })

  it('bypass accepts local http hostnames only', () => {
    const local = makeRequest('http://127.0.0.1:8787/api/chat/messages', {
      origin: 'http://localhost:5173',
    })
    expect(isAllowedOrigin(local, true)).toBe(true)

    const mapped = makeRequest('http://solidays.win/api/chat/messages', {
      origin: 'http://solidays.win',
    })
    expect(isAllowedOrigin(mapped, true)).toBe(true)

    const remote = makeRequest('http://127.0.0.1:8787/api/chat/messages', {
      origin: 'http://evil.example.com',
    })
    expect(isAllowedOrigin(remote, true)).toBe(false)
  })
})

describe('getClientIp', () => {
  it('reads CF-Connecting-IP', () => {
    const request = makeRequest('https://solidays.win/', { 'cf-connecting-ip': '203.0.113.7' })
    expect(getClientIp(request)).toBe('203.0.113.7')
  })

  it('falls back to unknown without the header', () => {
    expect(getClientIp(makeRequest('https://solidays.win/'))).toBe('unknown')
  })
})

describe('normalizePageUrl', () => {
  it('keeps same-origin paths with query strings', () => {
    const request = makeRequest('https://solidays.win/fnds')
    expect(normalizePageUrl('https://solidays.win/fnds?x=1', request)).toBe('/fnds?x=1')
  })

  it('resolves relative urls against the request', () => {
    const request = makeRequest('https://solidays.win/fnds')
    expect(normalizePageUrl('/fnds', request)).toBe('/fnds')
  })

  it('rejects cross-origin urls', () => {
    const request = makeRequest('https://solidays.win/')
    expect(normalizePageUrl('https://evil.example.com/x', request)).toBeNull()
  })

  it('rejects urls longer than 2048 characters', () => {
    const request = makeRequest('https://solidays.win/')
    const long = `https://solidays.win/${'a'.repeat(2100)}`
    expect(normalizePageUrl(long, request)).toBeNull()
  })

  it('returns null for empty values', () => {
    const request = makeRequest('https://solidays.win/')
    expect(normalizePageUrl(null, request)).toBeNull()
    expect(normalizePageUrl('', request)).toBeNull()
  })
})
