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

const { sessionCtx } = h

const PORT = Number(process.env.API_PORT) || 4174
const HOST = '127.0.0.1'
const MAX_BODY = 256 * 1024

/* Router table: { method, re, handler, auth }.
 * `re` uses named groups for path params (e.g. (?<email>[^/]+)). */
const ROUTES = [
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
  // clip
  { method: 'GET',    re: /^\/api\/clip\/(?<path>[^/]+)$/,  handler: h.getClip,    auth: 'whitelisted' },
  { method: 'POST',   re: /^\/api\/clip$/,                    handler: h.createClip, auth: 'whitelisted' },
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
  const session = readSession(req)
  const ctx = sessionCtx(session)
  const denied = authorize(route.auth, session, ctx)
  if (denied) return send(res, denied, { error: denied === 401 ? 'not authenticated' : 'forbidden' })

  const { body, error } = await readJsonBody(req)
  if (error) return send(res, error, { error: error === 413 ? 'request too large' : error === 415 ? 'content-type must be application/json' : 'bad request' })

  try {
    await route.handler({ req, res, body, params, session, ctx, ip: getClientIp(req) })
  } catch (err) {
    console.error('[handler error]', err)
    send(res, 500, { error: 'internal error' })
  }
})

// Hourly purge of expired clips (in addition to lazy purge in clip handlers).
setInterval(() => {
  try { h.purgeExpired?.(Date.now()) } catch (e) { console.error('[purge]', e) }
}, 60 * 60 * 1000).unref?.()

server.listen(PORT, HOST, () => {
  console.log(`aarg.dev API listening on http://${HOST}:${PORT}`)
})

export { server }
