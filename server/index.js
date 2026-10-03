/* aarg.dev API — bare node:http + built-in node:sqlite, zero npm deps.
 * Listens on 127.0.0.1:API_PORT (default 4174) behind an nginx /api/ proxy.
 *
 * Tiny regex router with named groups; JSON request/response; auth gating
 * re-checks whitelist/admin capability per request from the DB/.env so a
 * stateless cookie can still be revoked instantly.
 */
import { createServer } from 'node:http'
import { readSession } from './auth.js'
import * as h from './handlers.js'
import * as reward from './reward-handlers.js'

const { sessionCtx } = h

const PORT = process.env.API_PORT === undefined ? 4174 : Number(process.env.API_PORT)
const HOST = '127.0.0.1'
const MAX_BODY = 256 * 1024

/* Router table: { method, re, handler, auth }.
 * `re` uses named groups for path params (e.g. (?<email>[^/]+)). */
const ROUTES = [
  { method: 'GET', re: /^\/api\/admin\/reward$/, handler: reward.adminReward, auth: 'admin', reward: true },
  { method: 'POST', re: /^\/api\/admin\/reward\/arm$/, handler: reward.adminArmReward, auth: 'admin', reward: true },
  { method: 'GET', re: /^\/api\/reward\/(?<slug>[A-Za-z0-9_-]{22})\/status$/, handler: reward.rewardStatus, auth: 'public', reward: true },
  { method: 'POST', re: /^\/api\/reward\/(?<slug>[A-Za-z0-9_-]{22})\/unlock$/, handler: reward.rewardUnlock, auth: 'public', reward: true },
  { method: 'POST', re: /^\/api\/reward\/(?<slug>[A-Za-z0-9_-]{22})\/claim$/, handler: reward.rewardClaim, auth: 'public', reward: true },
  { method: 'POST', re: /^\/api\/reward\/(?<slug>[A-Za-z0-9_-]{22})\/acknowledge$/, handler: reward.rewardAcknowledge, auth: 'public', reward: true },
  // auth
  { method: 'POST',   re: /^\/api\/auth\/signup$/,  handler: h.signup,  auth: 'public' },
  { method: 'POST',   re: /^\/api\/auth\/login$/,   handler: h.login,   auth: 'public' },
  { method: 'POST',   re: /^\/api\/auth\/logout$/,  handler: h.logout,  auth: 'public' },
  { method: 'GET',    re: /^\/api\/auth\/me$/,      handler: h.me,      auth: 'public' },
  // admin
  { method: 'POST',   re: /^\/api\/admin\/login$/,                       handler: h.adminLogin,        auth: 'public' },
  { method: 'POST',   re: /^\/api\/admin\/logout$/,                       handler: h.adminLogout,       auth: 'admin' },
  { method: 'GET',    re: /^\/api\/admin\/whitelist$/,                    handler: h.listWhitelist,     auth: 'admin' },
  { method: 'POST',   re: /^\/api\/admin\/whitelist$/,                    handler: h.addWhitelist,      auth: 'admin' },
  { method: 'DELETE', re: /^\/api\/admin\/whitelist\/(?<email>[^/]+)$/,    handler: h.removeWhitelist,  auth: 'admin' },
  { method: 'GET',    re: /^\/api\/admin\/clips$/,                         handler: h.adminListClips,    auth: 'admin' },
  { method: 'DELETE', re: /^\/api\/admin\/clips\/(?<path>[^/]+)$/,         handler: h.adminDeleteClip,   auth: 'admin' },
  { method: 'GET',    re: /^\/api\/admin\/short-links$/,                   handler: h.adminListShortLinks,   auth: 'admin' },
  { method: 'DELETE', re: /^\/api\/admin\/short-links\/(?<path>[^/]+)$/,    handler: h.adminDeleteShortLink,  auth: 'admin' },
  // public short links
  { method: 'POST',   re: /^\/api\/short-links$/,                         handler: h.createShortLink,   auth: 'public' },
  { method: 'GET',    re: /^\/api\/short-links\/(?<path>[^/]+)$/,          handler: h.resolveShortLink,  auth: 'public' },
  // clip
  { method: 'GET',    re: /^\/api\/clip\/(?<path>[^/]+)\/file$/, handler: h.downloadClipFile, auth: 'whitelisted' },
  { method: 'POST',   re: /^\/api\/clip\/(?<path>[^/]+)\/file$/, handler: h.uploadClipFile,   auth: 'whitelisted', raw: true },
  { method: 'GET',    re: /^\/api\/clip\/(?<path>[^/]+)$/,  handler: h.getClip,       auth: 'whitelisted' },
  { method: 'DELETE', re: /^\/api\/clip\/(?<path>[^/]+)$/,  handler: h.deleteOwnClip, auth: 'whitelisted' },
  { method: 'POST',   re: /^\/api\/clip$/,                    handler: h.createClip, auth: 'whitelisted' },
  // market data (proxied + cached server-side; stock APIs are CORS-blocked in browsers)
  { method: 'GET',    re: /^\/api\/market\/spx$/,             handler: h.marketSpx,  auth: 'public' },
  { method: 'GET',    re: /^\/api\/market\/swdev$/,           handler: h.marketSwdev, auth: 'public' },
]

/* ---- helpers ---- */
export function getClientIp(req) {
  return req.headers['cf-connecting-ip'] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown'
}

function send(res, status, obj) { return h.send(res, status, obj) }

function readJsonBody(req) {
  return new Promise((resolve) => {
    const method = req.method
    const ct = (req.headers['content-type'] || '').toLowerCase()
    const hasBody = method === 'POST' || method === 'PUT' || method === 'PATCH'

    // POST/PUT/PATCH must declare JSON (CSRF backstop); allow empty body.
    if (hasBody && !ct.includes('application/json')) {
      resolve({ error: 415 })
      return
    }
    if (method === 'GET' || method === 'DELETE') {
      resolve({ body: {} })
      return
    }

    const chunks = []
    let size = 0
    let aborted = false
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        if (!aborted) { aborted = true; resolve({ error: 413 }) }
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (aborted) return
      const raw = Buffer.concat(chunks).toString('utf8')
      if (raw.length === 0) { resolve({ body: {} }); return }
      try { resolve({ body: JSON.parse(raw) }) }
      catch { resolve({ error: 400 }) }
    })
    req.on('error', () => resolve({ error: 400 }))
  })
}

/* Raw-body reader for file uploads (routes marked raw: true). Requires
 * application/octet-stream — like the JSON rule, a non-simple content type
 * forces a CORS preflight, which is the CSRF backstop. Resolves the body
 * as a Buffer. */
function readRawBody(req, maxBytes) {
  return new Promise((resolve) => {
    const ct = (req.headers['content-type'] || '').toLowerCase()
    if (!ct.includes('application/octet-stream')) {
      resolve({ error: 415 })
      return
    }
    const chunks = []
    let size = 0
    let aborted = false
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) {
        if (!aborted) { aborted = true; resolve({ error: 413 }) }
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      if (aborted) return
      resolve({ body: Buffer.concat(chunks) })
    })
    req.on('error', () => resolve({ error: 400 }))
  })
}

function authorize(auth, session, ctx) {
  switch (auth) {
    case 'public': return null
    case 'user':     return session ? null : 401
    case 'whitelisted': return (ctx.whitelisted || ctx.admin) ? null : (session ? 403 : 401)
    case 'admin':    return ctx.admin ? null : 401
    default: return 500
  }
}

const server = createServer(async (req, res) => {
  // CORS: same-origin only behind nginx; explicitly reject cross-origin credentialed use.
  res.setHeader('Vary', 'Origin')
  const origin = req.headers.origin
  if (origin) res.setHeader('Access-Control-Allow-Origin', 'null')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = req.url.split('?')[0]
  const route = ROUTES.find((r) => r.method === req.method && r.re.test(url))

  if (!route) {
    // Distinguish 405 (path exists for another method) from 404.
    const pathExists = ROUTES.some((r) => r.re.test(url))
    return send(res, pathExists ? 405 : 404, { error: pathExists ? 'method not allowed' : 'not found' })
  }

  const params = route.re.exec(url).groups || {}
  if (route.reward) {
    res.setHeader('Cache-Control', 'no-store')
    // Explicitly configured origin: never trust an arbitrary forwarded Host.
    const allowedOrigin = process.env.REWARD_ORIGIN || 'https://aarg.dev'
    if ((origin && origin !== allowedOrigin) || req.headers['sec-fetch-site'] === 'cross-site' || (req.method === 'POST' && origin !== allowedOrigin)) {
      return send(res, 403, { error: 'same-origin request required' })
    }
  }
  const session = readSession(req)
  const ctx = sessionCtx(session)
  const denied = authorize(route.auth, session, ctx)
  if (denied) return send(res, denied, { error: denied === 401 ? 'not authenticated' : 'forbidden' })

  const { body, error } = route.raw
    ? await readRawBody(req, h.FILE_MAX_BYTES)
    : await readJsonBody(req)
  if (error) {
    return send(res, error, {
      error: error === 413 ? (route.raw ? 'file too large (5 MB max)' : 'request too large')
        : error === 415 ? `content-type must be ${route.raw ? 'application/octet-stream' : 'application/json'}`
        : 'bad request',
    })
  }

  try {
    if (route.reward && (!body || typeof body !== 'object' || Array.isArray(body))) return send(res, 400, { error: 'JSON object required' })
    await route.handler({ req, res, body, params, session, ctx, ip: getClientIp(req) })
  } catch (err) {
    if (route.reward) console.error('[reward handler error]')
    else console.error('[handler error]', err)
    send(res, 500, { error: 'internal error' })
  }
})

// Hourly purge of expired clips (in addition to lazy purge in clip handlers).
setInterval(() => {
  try {
    h.purgeExpired?.(Date.now())
    h.purgeExpiredShortLinks?.(Date.now())
  } catch (e) { console.error('[purge]', e) }
}, 60 * 60 * 1000).unref?.()

server.listen(PORT, HOST, () => {
  console.log(`aarg.dev API listening on http://${HOST}:${server.address().port}`)
})

export { server }
