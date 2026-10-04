import { createHmac } from 'node:crypto'
import { db, stmt } from './db.js'
import { verifyPassword, rateHit } from './auth.js'
import { createRewardStore, tokenHash, TOKEN_MS, RECOVERY_MS } from './reward-store.js'

// Even the verifier stays private: public hashes allow offline dictionary guesses.
const PASSWORD_HASH = process.env.REWARD_PASSWORD_HASH || ''
const COOKIE = '__Host-aarg_reward'
export const rewardStore = createRewardStore(db, (slug) => stmt.shortLinkExists.get(slug) || stmt.clipExists.get(slug))

function hashFromRequest(req) {
  const value = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1)
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? tokenHash(value) : null
}
function send(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(JSON.stringify(value))
}
function exists(params, res) {
  if (rewardStore.matches(params.slug)) return true
  send(res, 404, { error: 'not found' })
  return false
}
function accountId(ctx) {
  return ctx?.email ? stmt.getUserByEmail.get(ctx.email)?.id ?? null : null
}
export function rewardStatus({ req, res, params, ctx }) {
  if (!exists(params, res)) return
  send(res, 200, rewardStore.status(hashFromRequest(req), accountId(ctx)))
}
export function rewardUnlock({ req, res, params, body, ip, ctx }) {
  if (!exists(params, res)) return
  const userId = accountId(ctx)
  if (rewardStore.snapshot().state === 'armed' && !userId) return send(res, 401, { code: 'login_required', error: 'log in to continue' })
  const bucket = createHmac('sha256', process.env.SESSION_SECRET).update(String(ip)).digest('hex')
  if (!rateHit(`reward:${bucket}`, 10, 15 * 60 * 1000) || !rateHit('reward:global', 100, 60 * 1000)) {
    return send(res, 429, { error: 'too many guesses; try again later' })
  }
  if (typeof body.password !== 'string' || body.password.length > 128 || !verifyPassword(body.password, PASSWORD_HASH)) {
    return send(res, 401, { error: 'the battery tray knows the password' })
  }
  let hash = hashFromRequest(req)
  const raw = rewardStore.issue(hash, userId)
  if (raw) {
    hash = tokenHash(raw)
    res.setHeader('Set-Cookie', `${COOKIE}=${raw}; Max-Age=${(TOKEN_MS + RECOVERY_MS) / 1000}; Path=/; HttpOnly; Secure; SameSite=Strict`)
  }
  send(res, 200, rewardStore.status(hash, userId))
}
export function rewardClaim({ req, res, params, ctx }) {
  if (!exists(params, res)) return
  const userId = accountId(ctx)
  if (!userId) return send(res, 401, { code: 'login_required', error: 'log in to continue' })
  send(res, 200, rewardStore.claim(hashFromRequest(req), userId))
}
export function rewardAcknowledge({ req, res, params, ctx }) {
  if (!exists(params, res)) return
  const userId = accountId(ctx)
  if (!userId) return send(res, 401, { code: 'login_required', error: 'log in to continue' })
  if (!rewardStore.acknowledge(hashFromRequest(req), userId)) return send(res, 403, { error: 'use the winning account and browser' })
  send(res, 200, { state: 'saved' })
}
export function adminReward({ res }) {
  const row = rewardStore.snapshot()
  send(res, 200, { alpha: true, url: `/${row.slug}`, state: row.state, claimed_at: row.claimed_at, expires_at: row.expires_at, acknowledged_at: row.acknowledged_at })
}
export function adminArmReward({ res }) {
  if (!PASSWORD_HASH) return send(res, 503, { error: 'reward password is not configured on the server' })
  if (!rewardStore.arm()) return send(res, 409, { error: 'this reward is already armed or has been claimed' })
  adminReward({ res })
}
