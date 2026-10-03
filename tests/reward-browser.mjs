// Run with PLAYWRIGHT_MODULE and CHROMIUM_PATH pointing to installed tools.
// Fake credentials, a temporary database, localhost only; no production requests.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createHmac, randomBytes, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { DatabaseSync } from 'node:sqlite'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const dir = await mkdtemp(join(tmpdir(), 'aarg-browser-test-'))
const artifacts = resolve('.reward-test.local')
await mkdir(artifacts, { recursive: true })
const origin = 'http://localhost:5188'
const secret = 'browser-test-only-session-secret'
const password = randomBytes(24).toString('base64url')
const salt = randomBytes(16)
const passwordHash = ['scrypt', 16384, 8, 1, salt.toString('base64'), scryptSync(password, salt, 64).toString('base64')].join('$')
const children = []
let browser
async function launch(args, env, pattern) {
  const child = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(child)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('server startup timeout')), 15000)
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk; const match = output.match(pattern); if (match) { clearTimeout(timeout); resolve(match) } })
    child.stderr.on('data', () => {})
    child.on('error', (error) => { clearTimeout(timeout); reject(error) })
    child.on('exit', (code) => { clearTimeout(timeout); reject(new Error(`server exited ${code}`)) })
  })
}
try {
  const match = await launch(['server/index.js'], { AARG_DATA_DIR: dir, API_PORT: '0', SESSION_SECRET: secret, REWARD_ORIGIN: origin, REWARD_PASSWORD_HASH: passwordHash, ADMIN_PSK_HASH: '', TOTP_SECRET: '' }, /http:\/\/127\.0\.0\.1:\d+/)
  await launch(['node_modules/vite/bin/vite.js', '--port', '5188', '--strictPort'], { AARG_API_TARGET: match[0], NO_COLOR: '1' }, /localhost:5188/)
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true })
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'], reducedMotion: 'reduce' })
  // Block telemetry dependencies; keep this verification entirely local.
  await context.route('**/*', (route) => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort())
  const errors = []
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)))
  const page = await context.newPage()
  const payload = Buffer.from(JSON.stringify({ admin: 1, exp: Date.now() + 3600000 })).toString('base64url')
  const mac = createHmac('sha256', secret).update(Buffer.from(payload, 'base64url')).digest('base64url')
  await context.addCookies([{ name: 'aarg_sess', value: `${payload}.${mac}`, url: origin, httpOnly: true, secure: true, sameSite: 'Lax' }])
  await page.goto(`${origin}/admin`)
  await page.getByRole('button', { name: 'reward', exact: true }).click()
  const physical = page.locator('a[target="_blank"]')
  await physical.waitFor()
  const path = await physical.getAttribute('href')
  assert.match(path, /^\/[\w-]{22}$/)
  await page.getByRole('button', { name: 'Arm reward', exact: true }).click()
  await page.getByRole('button', { name: 'Arm reward', exact: true }).click()
  await page.getByText('armed', { exact: true }).waitFor()
  console.log('PASS admin arming and stable physical link')
  await page.goto(origin + path)
  await page.getByLabel('Secret word').fill('incorrect')
  await page.getByRole('button', { name: /UNLOCK QUESTIONABLE/ }).click()
  await page.getByRole('alert').filter({ hasText: 'battery tray' }).waitFor()
  await page.getByLabel('Secret word').fill(password)
  await page.getByRole('button', { name: /UNLOCK QUESTIONABLE/ }).click()
  await page.getByRole('button', { name: 'CLAIM YOUR 256 DOGE', exact: true }).waitFor()
  const cookies = await context.cookies()
  const token = cookies.find((cookie) => cookie.name === '__Host-aarg_reward')
  assert.ok(token?.httpOnly && token.secure && token.sameSite === 'Strict')
  for (const width of [320, 360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`)
    await page.screenshot({ path: join(artifacts, `reward-${width}.png`), fullPage: true })
  }
  await page.getByRole('button', { name: 'Dismiss bonus popup' }).click()
  console.log('PASS wrong password, secure cookie, popup, responsive layouts 320/360/390/430/1280')
  let dropped = false
  await page.route('**/api/reward/*/claim', async (route) => {
    if (!dropped) { dropped = true; await route.fetch(); await route.abort() }
    else await route.continue()
  })
  await page.getByRole('button', { name: 'CLAIM YOUR 256 DOGE', exact: true }).click()
  await page.getByRole('alert').waitFor()
  await page.getByRole('button', { name: 'CLAIM YOUR 256 DOGE', exact: true }).click()
  await page.locator('#reward-phrase').waitFor()
  assert.match(await page.locator('#reward-phrase').inputValue(), /NOT-A-WALLET/)
  await page.getByRole('button', { name: 'Copy test phrase' }).click()
  await page.getByRole('button', { name: 'Copied!' }).waitFor()
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /NOT-A-WALLET/)
  await page.screenshot({ path: join(artifacts, 'winner.png'), fullPage: true })
  console.log('PASS dropped claim response recovery and clipboard')
  const stranger = await browser.newContext()
  await stranger.route('**/*', (route) => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort())
  const other = await stranger.newPage()
  await other.goto(origin + path)
  await other.getByRole('heading', { name: 'sorry someone beat you to it!' }).waitFor()
  await other.screenshot({ path: join(artifacts, 'consolation.png'), fullPage: true })
  await stranger.close()
  const saved = await context.storageState()
  await context.close()
  const restored = await browser.newContext({ storageState: saved })
  await restored.route('**/*', (route) => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort())
  const returning = await restored.newPage()
  await returning.goto(origin + path)
  await returning.getByRole('button', { name: 'Show my test phrase' }).click()
  await returning.locator('#reward-phrase').waitFor()
  await returning.getByRole('button', { name: 'Thanks, I have saved it' }).click()
  await returning.getByRole('heading', { name: 'Thanks for being curious.' }).waitFor()
  await returning.reload()
  await returning.getByRole('heading', { name: 'sorry someone beat you to it!' }).waitFor()
  console.log('PASS other browser denied, returning winner recovered, acknowledgment permanently closed')
  // Fresh test-only state to exercise browser timeout without waiting an hour.
  const db = new DatabaseSync(join(dir, 'aarg.db'))
  db.prepare("UPDATE reward_campaigns SET state='reserved', acknowledged_at=NULL, expires_at=?").run(Date.now() + 4000)
  await returning.reload()
  await returning.getByRole('button', { name: 'Show my test phrase' }).click()
  await returning.locator('#reward-phrase').waitFor()
  await returning.getByRole('heading', { name: 'sorry someone beat you to it!' }).waitFor({ timeout: 10000 })
  assert.equal(await returning.locator('#reward-phrase').count(), 0)
  db.close()
  console.log('PASS phrase cleared on deadline')
  for (const path of ['/', '/blog', '/short']) {
    await returning.goto(origin + path)
    await returning.locator('.tui-frame').first().waitFor()
    assert.equal(await returning.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  }
  assert.deepEqual(errors, [])
  console.log('PASS home/blog/shortener render, no captured browser exceptions')
  console.log(`Screenshots: ${artifacts}`)
} finally {
  await browser?.close()
  for (const child of children.reverse()) {
    if (child.exitCode === null) { const done = once(child, 'exit'); child.kill(); await done }
  }
  await rm(dir, { recursive: true, force: true })
}
