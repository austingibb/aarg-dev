import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHmac, randomBytes, scryptSync } from 'node:crypto'
import { once } from 'node:events'

const origin = 'http://localhost:5173'
const secret = 'reward-alpha-test-session-secret-not-production'
const password = randomBytes(24).toString('base64url')
const salt = randomBytes(16)
const passwordHash = ['scrypt', 16384, 8, 1, salt.toString('base64'), scryptSync(password, salt, 64).toString('base64')].join('$')
function adminCookie(payload = { admin: 1, exp: Date.now() + 60000 }) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', secret).update(Buffer.from(body, 'base64url')).digest('base64url')
  return `aarg_sess=${body}.${mac}`
}
async function start(directory) {
  const child = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, AARG_DATA_DIR: directory, API_PORT: '0', SESSION_SECRET: secret, REWARD_ORIGIN: origin, REWARD_PASSWORD_HASH: passwordHash, ADMIN_PSK_HASH: '', TOTP_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const base = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error('API startup timed out')) }, 15000)
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/)
      if (match) { clearTimeout(timeout); resolve(match[0]) }
    })
    child.on('error', (error) => { clearTimeout(timeout); reject(error) })
    child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`API exited: ${code}`)) })
  })
  return {
    async stop() { if (child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done } },
    async call(path, { method = 'GET', cookie, body, requestOrigin = origin } = {}) {
      const res = await fetch(base + path, { method, headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) })
      return { status: res.status, cookie: res.headers.get('set-cookie')?.split(';')[0], cache: res.headers.get('cache-control'), data: await res.json() }
    },
  }
}

test('HTTP gate, concurrent claims, restart recovery and acknowledgment', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'aarg-reward-test-'))
  let api
  t.after(async () => { await api?.stop(); await rm(directory, { recursive: true, force: true }) })
  api = await start(directory)
  assert.equal((await api.call('/api/admin/reward')).status, 401)
  const admin = adminCookie()
  const details = await api.call('/api/admin/reward', { cookie: admin })
  assert.equal(details.data.state, 'disarmed')
  const slug = details.data.url.slice(1)
  const root = `/api/reward/${slug}`
  assert.equal((await api.call(`/api/short-links/${slug}`)).data.kind, 'reward')
  assert.equal((await api.call(`/api/admin/short-links/${slug}`, { method: 'DELETE', cookie: admin })).status, 409)
  assert.equal((await api.call('/api/short-links', { method: 'POST', body: { path: slug, url: 'https://example.com', lifetime: 'forever' } })).status, 409)
  assert.equal((await api.call('/api/reward/aaaaaaaaaaaaaaaaaaaaaa/status')).status, 404)
  assert.equal((await api.call(`${root}/claim`, { method: 'POST' })).data.phrase, undefined)
  assert.equal((await api.call('/api/admin/reward/arm', { method: 'POST', cookie: admin, requestOrigin: 'https://evil.invalid' })).status, 403)
  assert.equal((await api.call('/api/admin/reward/arm', { method: 'POST', cookie: admin })).status, 200)
  assert.equal((await api.call(`${root}/claim`, { method: 'POST' })).status, 401)
  assert.equal((await api.call(`${root}/status`)).data.state, 'login_required')
  assert.equal((await api.call(`${root}/unlock`, { method: 'POST', body: { password } })).status, 401)
  assert.equal((await api.call(`${root}/unlock`, { method: 'POST', cookie: admin, body: { password } })).status, 401)
  const missingAccount = adminCookie({ email: 'missing@example.invalid', admin: 0, exp: Date.now() + 60000 })
  assert.equal((await api.call(`${root}/unlock`, { method: 'POST', cookie: missingAccount, body: { password } })).status, 401)
  const expiredAccount = adminCookie({ email: 'a@example.invalid', admin: 0, exp: Date.now() - 1 })
  assert.equal((await api.call(`${root}/unlock`, { method: 'POST', cookie: expiredAccount, body: { password } })).status, 401)
  async function register(email) {
    const account = await api.call('/api/auth/signup', { method: 'POST', body: { email, password } })
    assert.equal(account.status, 200)
    const unlocked = await api.call(`${root}/unlock`, { method: 'POST', cookie: account.cookie, body: { password } })
    assert.equal(unlocked.data.state, 'available')
    return { cookie: `${account.cookie}; ${unlocked.cookie}`, accountCookie: account.cookie, tokenCookie: unlocked.cookie }
  }
  const a = await register('a@example.invalid')
  const b = await register('b@example.invalid')
  assert.ok(a.cookie && b.cookie && a.cookie !== b.cookie)
  const claims = await Promise.all([a, b].map(({ cookie }) => api.call(`${root}/claim`, { method: 'POST', cookie })))
  assert.equal(claims.filter((r) => r.data.phrase).length, 1)
  const winner = claims[0].data.phrase ? a : b
  const loser = winner === a ? b : a
  const winningResult = claims.find((r) => r.data.phrase)
  assert.equal((await api.call(`${root}/claim`, { method: 'POST', cookie: winner.tokenCookie })).status, 401)
  assert.equal((await api.call(`${root}/claim`, { method: 'POST', cookie: `${loser.accountCookie}; ${winner.tokenCookie}` })).data.phrase, undefined)
  assert.match(winningResult.data.phrase, /NOT-A-WALLET/)
  assert.equal(winningResult.cache, 'no-store')
  await api.stop()
  api = await start(directory)
  const recovered = await api.call(`${root}/claim`, { method: 'POST', cookie: winner.cookie })
  assert.equal(recovered.data.phrase, winningResult.data.phrase)
  assert.equal(recovered.data.expires_at, winningResult.data.expires_at)
  assert.equal((await api.call(`${root}/claim`, { method: 'POST', cookie: loser.cookie })).data.phrase, undefined)
  assert.equal((await api.call(`${root}/acknowledge`, { method: 'POST', cookie: loser.cookie })).status, 403)
  for (let i = 0; i < 2; i++) assert.equal((await api.call(`${root}/acknowledge`, { method: 'POST', cookie: winner.cookie })).status, 200)
  assert.equal((await api.call(`${root}/claim`, { method: 'POST', cookie: winner.cookie })).data.phrase, undefined)
  assert.equal((await api.call('/api/admin/reward/arm', { method: 'POST', cookie: admin })).status, 409)
  assert.equal((await api.call('/api/auth/me')).status, 200)
  const short = await api.call('/api/short-links', { method: 'POST', body: { path: 'alpha-regression', url: 'https://example.com/', lifetime: 'forever' } })
  assert.equal(short.status, 201)
  assert.equal((await api.call('/api/short-links/alpha-regression')).data.target_url, 'https://example.com/')
  const clip = await api.call('/api/clip', { method: 'POST', cookie: admin, body: { path: 'alpha-clip', content: 'regression fixture' } })
  assert.equal(clip.status, 200)
  assert.equal((await api.call('/api/clip/alpha-clip', { cookie: admin })).data.content, 'regression fixture')
  assert.equal((await api.call(`${root}/status`)).data.state, 'password_required')
  for (let i = 0; i < 10; i++) {
    assert.equal((await api.call(`${root}/unlock`, { method: 'POST', body: { password: 'wrong' } })).status, 401)
  }
  const limited = await api.call(`${root}/unlock`, { method: 'POST', body: { password: 'wrong' } })
  assert.equal(limited.status, 429)
  assert.equal(limited.cache, 'no-store')
})
