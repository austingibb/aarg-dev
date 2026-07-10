/* Passwords, stateless HMAC session cookies, and an in-memory rate limiter.
 * No dependencies beyond node:crypto. The session cookie is base64url(payload)
 * + '.' + base64url(HMAC-SHA256(payload, SESSION_SECRET)); whitelist/admin
 * capability is re-checked against the DB/.env on every request, so revocation
 * is instant despite the cookie being stateless.
 */
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'

const SESSION_SECRET = process.env.SESSION_SECRET
if (!SESSION_SECRET) {
  console.error('SESSION_SECRET missing — run: node scripts/generate-secrets.js')
  process.exit(1)
}
const SECRET = Buffer.from(SESSION_SECRET, 'utf8')

const USER_MAX_AGE = 7 * 24 * 3600 * 1000      // 7 days
const ADMIN_MAX_AGE = 12 * 3600 * 1000           // 12h cap for admin-flagged sessions
export { USER_MAX_AGE, ADMIN_MAX_AGE }
export const COOKIE_NAME = 'aarg_sess'

/* ---------------- passwords (scrypt) ---------------- */
export function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`
}

export function verifyPassword(password, stored) {
  const parts = String(stored).split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  try {
    const salt = Buffer.from(parts[4], 'base64')
    const want = Buffer.from(parts[5], 'base64')
    const got = scryptSync(password, salt, want.length, {
      N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]),
    })
    return got.length === want.length && timingSafeEqual(got, want)
  } catch {
    return false
  }
}

// A real-ish scrypt hash to burn equal time on unknown emails (no enumeration).
const DUMMY_HASH = hashPassword('dummy-password-for-timing')

export function dummyVerify() {
  verifyPassword('x', DUMMY_HASH)
}

/* ---------------- session cookies ---------------- */
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const b64uDec = (s) => Buffer.from(s, 'base64url')

export function makeSession(payload) {
  const body = JSON.stringify(payload)
  const mac = createHmac('sha256', SECRET).update(body).digest()
  return `${b64u(body)}.${b64u(mac)}`
}

export function parseSession(cookieValue) {
  if (!cookieValue || typeof cookieValue !== 'string') return null
  const dot = cookieValue.lastIndexOf('.')
  if (dot === -1) return null
  const body = cookieValue.slice(0, dot)
  const mac = cookieValue.slice(dot + 1)
  let expected
  try {
    expected = createHmac('sha256', SECRET).update(b64uDec(body)).digest()
  } catch {
    return null
  }
  let got
  try {
    got = b64uDec(mac)
  } catch {
    return null
  }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null
  try {
    return JSON.parse(b64uDec(body).toString('utf8'))
  } catch {
    return null
  }
}

/** Build the Set-Cookie header value for a session payload. */
export function sessionCookie(payload, maxAge = USER_MAX_AGE) {
  const exp = Date.now() + maxAge
  const value = makeSession({ ...payload, iat: Math.floor(Date.now() / 1000), exp })
  const flags = 'HttpOnly; Secure; SameSite=Lax; Path=/'
  return `${COOKIE_NAME}=${value}; Max-Age=${Math.floor(maxAge / 1000)}; ${flags}`
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`
}

/** Read & verify the cookie from request headers; returns payload or null. */
export function readSession(req) {
  const header = req.headers['cookie'] || ''
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === COOKIE_NAME) {
      const payload = parseSession(rest.join('='))
      if (!payload) return null
      if (typeof payload.exp !== 'number' || Date.now() > payload.exp) return null
      return payload
    }
  }
  return null
}

/* ---------------- rate limiter (in-memory, single process) ----------------
 * Buckets keyed on a string; each bucket = array of recent hit timestamps.
 * Returns true if allowed (and records the hit), false if over the limit. */
const buckets = new Map()
const SWEEP = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [k, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < SWEEP)
    if (fresh.length === 0) buckets.delete(k)
    else buckets.set(k, fresh)
  }
}, SWEEP).unref?.()

export function rateHit(key, max, windowMs) {
  const now = Date.now()
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs)
  if (hits.length >= max) return false
  hits.push(now)
  buckets.set(key, hits)
  return true
}
