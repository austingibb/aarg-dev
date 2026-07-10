/* RFC 6238 TOTP (time-based one-time password), hand-rolled — ~60 lines.
 * No dependencies beyond node:crypto. The shared secret is stored base32
 * (RFC 4648) in ADMIN_PSK... no, in TOTP_SECRET — see scripts/generate-secrets.js.
 *
 * verifyTotp uses a ±1 time-step window, a timingSafeEqual compare, and a
 * module-level last-accepted-counter replay guard so a single observed code
 * can't be replayed within the same process lifetime.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP = 30 // seconds

function base32Decode(str) {
  const clean = String(str).replace(/=+$/, '').replace(/\s/g, '').toUpperCase()
  let bits = 0, value = 0
  const out = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx === -1) throw new Error(`bad base32 char: ${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bits -= 8
      out.push((value >>> bits) & 0xff)
    }
  }
  return Buffer.from(out)
}

function codeForCounter(keyBuf, counter) {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const hmac = createHmac('sha1', keyBuf).update(buf).digest()
  const off = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[off] & 0x7f) << 24) |
    ((hmac[off + 1] & 0xff) << 16) |
    ((hmac[off + 2] & 0xff) << 8) |
    (hmac[off + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

// module-level replay guard: the highest counter we've accepted
let lastAccepted = -1

/** Verify a 6-digit TOTP code against the base32 secret.
 *  Returns true if valid (within ±1 step) and not a replay. */
export function verifyTotp(secretB32, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false
  const current = Math.floor(now / 1000 / STEP)
  const key = base32Decode(secretB32)
  const want = Buffer.from(code)
  for (let i = -1; i <= 1; i++) {
    const c = current + i
    if (c <= lastAccepted) continue // already used → replay
    const got = Buffer.from(codeForCounter(key, c))
    if (got.length === want.length && timingSafeEqual(got, want)) {
      lastAccepted = c
      return true
    }
  }
  return false
}
