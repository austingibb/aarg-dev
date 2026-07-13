/* API endpoint handlers for aarg.dev.
 * Each handler receives { req, res, body, params, session, ctx, ip } and uses
 * the shared `send` helper to respond. Auth gating is done by the router in
 * index.js; `ctx` is the per-request resolved capability (email/admin/whitelisted).
 */
import { db, stmt } from './db.js'
import {
  hashPassword, verifyPassword, dummyVerify,
  sessionCookie, clearCookie,
  rateHit, USER_MAX_AGE, ADMIN_MAX_AGE,
} from './auth.js'
import { verifyTotp } from './totp.js'
import { randomInt } from 'node:crypto'

const CLIP_TTL = (Number(process.env.CLIP_TTL_SECONDS) || 86400) * 1000
const CLIP_MAX_BYTES = 200 * 1024
export const FILE_MAX_BYTES = 5 * 1024 * 1024
const CLIP_PATH_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const MIME_RE = /^[\w.+-]+\/[\w.+-]+$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function send(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/* Resolve the live session into a richer context used by handlers:
 * { email, admin, whitelisted } — capability re-checked per request. */
export function sessionCtx(session) {
  if (!session) return { email: null, admin: false, whitelisted: false }
  const email = session.email || null
  const admin = !!session.admin
  const whitelisted = !!email && !!stmt.isWhitelisted.get(email)
  return { email, admin, whitelisted }
}

/* ---------------- auth endpoints ---------------- */
export function signup({ res, body, ip }) {
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'invalid email' })
  if (password.length < 8) return send(res, 400, { error: 'password must be at least 8 characters' })

  if (!rateHit(`signup:${ip}`, 5, 3600 * 1000)) {
    return send(res, 429, { error: 'too many signups, try later' })
  }

  if (stmt.getUserByEmail.get(email)) {
    return send(res, 409, { error: 'email already registered' })
  }
  stmt.createUser.run(email, hashPassword(password), Date.now())
  res.setHeader('Set-Cookie', sessionCookie({ email, admin: 0 }, USER_MAX_AGE))
  return send(res, 200, { email })
}

export function login({ res, body, ip, session }) {
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  if (!EMAIL_RE.test(email) || !password) {
    return send(res, 400, { error: 'invalid credentials' })
  }
  if (!rateHit(`login-ip:${ip}`, 10, 15 * 60 * 1000) ||
      !rateHit(`login-email:${email}`, 5, 15 * 60 * 1000)) {
    return send(res, 429, { error: 'too many attempts, try later' })
  }

  const user = stmt.getUserByEmail.get(email)
  const ok = user ? verifyPassword(password, user.pass_hash) : (dummyVerify(), false)
  if (!ok) return send(res, 401, { error: 'invalid credentials' })

  // Preserve an existing admin flag if the session already had one.
  const keepAdmin = session && session.admin ? 1 : 0
  res.setHeader('Set-Cookie', sessionCookie({ email: user.email, admin: keepAdmin }, keepAdmin ? ADMIN_MAX_AGE : USER_MAX_AGE))
  return send(res, 200, { email: user.email })
}

export function logout({ res, session }) {
  // Drop the user email but preserve an active admin session — admin is
  // orthogonal to user login and only ends via /api/admin/logout.
  if (session && session.admin) {
    res.setHeader('Set-Cookie', sessionCookie({ email: null, admin: 1 }, ADMIN_MAX_AGE))
    return send(res, 200, { ok: true, admin: true })
  }
  res.setHeader('Set-Cookie', clearCookie())
  return send(res, 200, { ok: true })
}

export function me({ res, session }) {
  const ctx = sessionCtx(session)
  return send(res, 200, {
    email: ctx.email,
    whitelisted: ctx.whitelisted,
    admin: ctx.admin,
  })
}

/* ---------------- admin endpoints ---------------- */
// The PSK is stored as a scrypt$... string (same format as passwords), so the
// password verifier works for it directly. PSK and TOTP are always both
// evaluated for uniform timing.
export function adminLogin({ res, body, ip, session }) {
  const psk = String(body.psk || '')
  const totp = String(body.totp || '')
  if (!psk || !/^\d{6}$/.test(totp)) {
    return send(res, 400, { error: 'psk and 6-digit totp required' })
  }
  if (!rateHit(`admin-login:${ip}`, 5, 3600 * 1000)) {
    return send(res, 429, { error: 'too many attempts, try later' })
  }
  // Always evaluate both, uniform timing.
  const pskOk = verifyPassword(psk, process.env.ADMIN_PSK_HASH || '')
  const totpOk = verifyTotp(process.env.TOTP_SECRET || '', totp)
  if (!pskOk || !totpOk) {
    return send(res, 401, { error: 'invalid credentials' })
  }
  const email = session && session.email ? session.email : null
  res.setHeader('Set-Cookie', sessionCookie({ email, admin: 1 }, ADMIN_MAX_AGE))
  return send(res, 200, { ok: true, admin: true })
}

export function adminLogout({ res, session }) {
  if (!session) return send(res, 401, { error: 'not authenticated' })
  const email = session.email || null
  res.setHeader('Set-Cookie', sessionCookie({ email, admin: 0 }, USER_MAX_AGE))
  return send(res, 200, { ok: true })
}

export function listWhitelist({ res }) {
  const rows = stmt.listWhitelist.all().map((r) => ({ email: r.email, added_at: r.added_at }))
  return send(res, 200, rows)
}

export function addWhitelist({ res, body }) {
  const email = String(body.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'invalid email' })
  stmt.addWhitelist.run(email, Date.now())
  return send(res, 200, { email })
}

export function removeWhitelist({ res, params }) {
  const email = String(params.email || '').trim().toLowerCase()
  if (!EMAIL_RE.test(email)) return send(res, 400, { error: 'invalid email' })
  stmt.removeWhitelist.run(email)
  return send(res, 200, { ok: true })
}

export function adminListClips({ res }) {
  const now = Date.now()
  const rows = stmt.listLiveClips.all(now).map((r) => ({
    path: r.path, created_by: r.created_by, created_at: r.created_at, expires_at: r.expires_at,
  }))
  return send(res, 200, rows)
}

export function adminDeleteClip({ res, params }) {
  const path = String(params.path || '')
  if (!CLIP_PATH_RE.test(path)) return send(res, 400, { error: 'invalid path' })
  stmt.deleteClip.run(path)
  return send(res, 200, { ok: true })
}

/* ---------------- clip endpoints ---------------- */
export function getClip({ res, params, ctx }) {
  const path = String(params.path || '')
  if (!CLIP_PATH_RE.test(path)) return send(res, 404, { error: 'no such clip' })
  purgeExpired()
  const now = Date.now()
  const clip = stmt.getLiveClip.get(path, now)
  if (!clip) return send(res, 404, { error: 'no such clip (or it expired)' })
  // Owner-only, except admin can read any clip (e.g. from the admin console).
  if (clip.created_by !== ctx.email && !ctx.admin) {
    return send(res, 403, { error: 'unauthorized — this clip belongs to another user' })
  }
  const file = stmt.getClipFileMeta.get(path) || null
  return send(res, 200, {
    path: clip.path, content: clip.content, expires_at: clip.expires_at,
    file: file ? { name: file.name, mime: file.mime, size: file.size } : null,
  })
}

/* Owner deletes their own clip (used to roll back creation when the file
 * upload step fails). Idempotent: deleting a missing/expired clip is ok. */
export function deleteOwnClip({ res, params, ctx }) {
  const path = String(params.path || '')
  if (!CLIP_PATH_RE.test(path)) return send(res, 400, { error: 'invalid path' })
  const clip = stmt.getLiveClip.get(path, Date.now())
  if (clip && clip.created_by !== ctx.email && !ctx.admin) {
    return send(res, 403, { error: 'unauthorized — this clip belongs to another user' })
  }
  stmt.deleteClip.run(path)
  return send(res, 200, { ok: true })
}

/* Attach a file to an existing clip (owner-only, one file per clip, 5 MB max).
 * The body arrives as a raw Buffer (route is marked raw in index.js); the
 * filename travels in the x-file-name header, encodeURIComponent-encoded. */
export function uploadClipFile({ req, res, body, params, ctx }) {
  const path = String(params.path || '')
  if (!CLIP_PATH_RE.test(path)) return send(res, 404, { error: 'no such clip' })
  purgeExpired()
  const clip = stmt.getLiveClip.get(path, Date.now())
  if (!clip) return send(res, 404, { error: 'no such clip (or it expired)' })
  if (clip.created_by !== ctx.email) {
    return send(res, 403, { error: 'unauthorized — this clip belongs to another user' })
  }
  if (stmt.getClipFileMeta.get(path)) {
    return send(res, 409, { error: 'clip already has a file attached' })
  }
  if (!body || body.length === 0) return send(res, 400, { error: 'file required' })
  if (body.length > FILE_MAX_BYTES) return send(res, 413, { error: 'file too large (5 MB max)' })

  let name = 'file'
  try { name = safeFileName(decodeURIComponent(req.headers['x-file-name'] || '')) }
  catch { /* malformed encoding — keep the fallback name */ }
  const rawMime = String(req.headers['x-file-mime'] || '')
  const mime = MIME_RE.test(rawMime) ? rawMime.slice(0, 100) : 'application/octet-stream'

  stmt.insertClipFile.run(path, name, mime, body.length, body)
  return send(res, 200, { name, mime, size: body.length })
}

/* Download a clip's attached file. Same access rule as reading the clip
 * (owner or admin). Always served as an octet-stream download — never the
 * stored mime — so an uploaded .html can't execute on this origin. */
export function downloadClipFile({ res, params, ctx }) {
  const path = String(params.path || '')
  if (!CLIP_PATH_RE.test(path)) return send(res, 404, { error: 'no such clip' })
  purgeExpired()
  const clip = stmt.getLiveClip.get(path, Date.now())
  if (!clip) return send(res, 404, { error: 'no such clip (or it expired)' })
  if (clip.created_by !== ctx.email && !ctx.admin) {
    return send(res, 403, { error: 'unauthorized — this clip belongs to another user' })
  }
  const file = stmt.getClipFile.get(path)
  if (!file) return send(res, 404, { error: 'no file attached to this clip' })

  const data = Buffer.from(file.data)
  const ascii = file.name.replace(/[^\x20-\x7e]/g, '_')
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': data.length,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  })
  res.end(data)
}

export function createClip({ res, body, ctx }) {
  const content = String(body.content ?? '')
  const buf = Buffer.from(content, 'utf8')
  // Text is optional when the client declares a file is coming (withFile) —
  // the attachment arrives in a follow-up request, and the client rolls the
  // clip back if that upload fails.
  if (buf.length === 0 && body.withFile !== true) {
    return send(res, 400, { error: 'content required (unless attaching a file)' })
  }
  if (buf.length > CLIP_MAX_BYTES) return send(res, 413, { error: 'content too large (200 KB max)' })

  let path = String(body.path || '').trim().toLowerCase()
  const replacing = body.replace === true
  const now = Date.now()
  purgeExpired()

  if (path) {
    if (!CLIP_PATH_RE.test(path)) return send(res, 400, { error: 'invalid path' })
    const existing = stmt.getLiveClip.get(path, now)
    if (replacing) {
      if (!existing) return send(res, 404, { error: 'clip to replace no longer exists' })
      if (existing.created_by !== ctx.email && !ctx.admin) {
        return send(res, 403, { error: 'unauthorized — this clip belongs to another user' })
      }
    } else if (existing || stmt.clipExists.get(path)) {
      return send(res, 409, { error: 'path already in use' })
    }
  } else {
    if (replacing) return send(res, 400, { error: 'path required to replace a clip' })
    path = generatePath()
    if (!path) return send(res, 507, { error: 'could not allocate a short path, retry' })
  }

  const expiresAt = now + CLIP_TTL
  if (replacing) {
    // Delete (including any attachment via ON DELETE CASCADE) and insert the
    // replacement atomically. Merely opening the replacement form does not
    // touch the existing clip; this runs only on an explicit form submission.
    db.exec('BEGIN IMMEDIATE')
    try {
      stmt.deleteClip.run(path)
      stmt.insertClip.run(path, content, ctx.email || 'anonymous', now, expiresAt)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } else {
    stmt.insertClip.run(path, content, ctx.email || 'anonymous', now, expiresAt)
  }
  return send(res, 200, { path, url: `/clip/${path}`, expires_at: expiresAt, replaced: replacing })
}

/* ---------------- market data proxy ----------------
 * The browser can't fetch stock APIs directly (CORS/key-walled), so the
 * backend proxies Yahoo Finance's keyless chart endpoint and caches it.
 * One upstream request per 10 min max, regardless of visitor count;
 * on upstream failure the last good payload is served stale. */
const SPX_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1mo'
const SPX_TTL = 10 * 60 * 1000
let spxCache = { at: 0, data: null }

export async function marketSpx({ res }) {
  const now = Date.now()
  if (spxCache.data && now - spxCache.at < SPX_TTL) return send(res, 200, spxCache.data)
  try {
    const r = await fetch(SPX_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (aarg.dev telemetry)' } })
    if (!r.ok) throw new Error(`upstream ${r.status}`)
    const j = await r.json()
    const result = j?.chart?.result?.[0]
    const closes = (result?.indicators?.quote?.[0]?.close || []).filter((c) => c != null)
    if (closes.length === 0) throw new Error('no data')
    const series = closes.slice(-14).map((c) => Math.round(c * 100) / 100)
    const price = result.meta?.regularMarketPrice ?? series[series.length - 1]
    spxCache = { at: now, data: { price, series } }
    return send(res, 200, spxCache.data)
  } catch (err) {
    console.error('[spx]', err.message || err)
    if (spxCache.data) return send(res, 200, spxCache.data) // stale beats nothing
    return send(res, 502, { error: 'market data unavailable' })
  }
}

/* ---- helpers ---- */
/* Keep only the basename, drop control chars and header-breaking quotes,
 * cap the length. Falls back to 'file' when nothing survives. */
function safeFileName(name) {
  const base = String(name || '').split(/[\\/]/).pop()
    // eslint-disable-next-line no-control-regex -- stripping control chars is the point
    .replace(/[\x00-\x1f\x7f"]/g, '').trim().slice(0, 120)
  return base || 'file'
}

function generatePath() {
  const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (const len of [3, 4]) {
    for (let attempt = 0; attempt < 5; attempt++) {
      let s = ''
      for (let i = 0; i < len; i++) s += CHARS[randomInt(0, CHARS.length)]
      if (!stmt.clipExists.get(s)) return s
    }
  }
  return null
}

let lastPurge = 0
export function purgeExpired(now = Date.now()) {
  if (now - lastPurge < 60 * 1000) return
  lastPurge = now
  stmt.purgeExpired.run(now)
}
