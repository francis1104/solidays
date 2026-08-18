const encoder = new TextEncoder()

export const ADMIN_COOKIE_NAME = '__Host-solidays_admin_session'
export const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const TOKEN_PATTERN = /^v1\.(\d{1,16})\.([0-9a-f]{64})\.([0-9a-f]{64})$/

export type AdminSession = {
  expiresAt: number
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return new Uint8Array(digest)
}

type SubtleCryptoWithTimingSafe = SubtleCrypto & {
  timingSafeEqual(a: ArrayBufferView, b: ArrayBufferView): boolean
}

function timingSafeEqualBytes(left: Uint8Array, right: Uint8Array): boolean {
  // Workers expose timingSafeEqual on SubtleCrypto; Next's DOM typings do not.
  const subtle = crypto.subtle as SubtleCryptoWithTimingSafe
  if (left.byteLength !== right.byteLength) {
    return !subtle.timingSafeEqual(left, left)
  }

  return subtle.timingSafeEqual(left, right)
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
    if (!Number.isFinite(value)) return null
    bytes[index] = value
  }
  return bytes
}

export async function verifyAdminPassword(env: CloudflareEnv, candidate: string): Promise<boolean> {
  const expected = env.ADMIN_PASSWORD
  const sessionSecret = env.ADMIN_SESSION_SECRET
  if (!expected || !sessionSecret) return false

  return timingSafeEqualBytes(await sha256Bytes(candidate), await sha256Bytes(expected))
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return toHex(new Uint8Array(signature))
}

function timingSafeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left)
  const rightBytes = hexToBytes(right)
  if (!leftBytes || !rightBytes) return false

  return timingSafeEqualBytes(leftBytes, rightBytes)
}

/**
 * Token layout: v1.<expiresAtMs>.<random32B-hex>.<HMAC-SHA256(v1.exp.random)>
 * The absolute expiry is signed and re-checked server-side, so a copied cookie
 * cannot be replayed after expiry even when sent manually.
 */
export async function createAdminSessionToken(env: CloudflareEnv): Promise<string> {
  const expiresAtMs = Date.now() + ADMIN_SESSION_TTL_MS
  const random = toHex(crypto.getRandomValues(new Uint8Array(32)))
  const payload = `v1.${expiresAtMs}.${random}`
  const mac = await signPayload(payload, env.ADMIN_SESSION_SECRET)
  return `${payload}.${mac}`
}

async function getVerifiedAdminSessionExpiry(
  env: CloudflareEnv,
  token: string
): Promise<number | null> {
  const secret = env.ADMIN_SESSION_SECRET
  if (!secret) return null

  const match = TOKEN_PATTERN.exec(token)
  if (!match) return null

  const [, expiresAtValue, random, mac] = match
  const expiresAt = Number(expiresAtValue)
  if (!Number.isSafeInteger(expiresAt)) return null

  const expectedMac = await signPayload(`v1.${expiresAtValue}.${random}`, secret)
  if (!timingSafeEqualHex(mac, expectedMac)) return null

  return expiresAt > Date.now() ? expiresAt : null
}

export async function verifyAdminSessionToken(env: CloudflareEnv, token: string): Promise<boolean> {
  return (await getVerifiedAdminSessionExpiry(env, token)) !== null
}

function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null

  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue

    if (part.slice(0, separator).trim() !== name) continue

    try {
      return decodeURIComponent(part.slice(separator + 1).trim())
    } catch {
      return null
    }
  }

  return null
}

export async function hasValidAdminSession(env: CloudflareEnv, request: Request): Promise<boolean> {
  return (await getAdminSession(env, request)) !== null
}

export async function getAdminSession(
  env: CloudflareEnv,
  request: Request
): Promise<AdminSession | null> {
  const token = getCookie(request, ADMIN_COOKIE_NAME)
  if (!token) return null

  const expiresAt = await getVerifiedAdminSessionExpiry(env, token)
  return expiresAt === null ? null : { expiresAt }
}

export function buildAdminSessionCookie(token: string): string {
  return [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
  ].join('; ')
}

export function buildAdminSessionClearCookie(): string {
  return [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
  ].join('; ')
}
