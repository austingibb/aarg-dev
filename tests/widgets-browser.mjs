// Verify dist-check only. No production API, credentials, or external requests.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, relative, extname } from 'node:path'
import { once } from 'node:events'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const root = resolve('dist-check')
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
const server = createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const file = resolve(root, `.${path}`)
    if (relative(root, file).startsWith('..')) { res.writeHead(403).end(); return }
    const target = extname(file) ? file : resolve(root, 'index.html')
    res.setHeader('Content-Type', mime[extname(target)] || 'application/octet-stream')
    res.end(await readFile(target))
  } catch { res.writeHead(404).end() }
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')
const origin = `http://127.0.0.1:${server.address().port}`
let browser
try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true })
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  let user = null
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/auth/me') return route.fulfill({ json: user })
    if (url.pathname.startsWith('/api/admin/')) return route.fulfill({ json: [] })
    return route.fulfill({ status: 404, json: { error: 'not found' } })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(origin)
  const nav = page.getByRole('navigation', { name: 'Site navigation' })
  await nav.getByRole('link', { name: /login/ }).waitFor()
  for (const id of ['home', 'whoami', 'about', 'links', 'activity', 'caffeine', 'commits', 'eth-transactions', 'eth-price', 'sp500', 'swdev']) {
    assert.equal(await page.locator(`[data-widget="${id}"]`).count(), 1, id)
  }
  assert.equal(await nav.getByRole('link', { name: /clip|admin|reward/ }).count(), 0)
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`)
  }
  await page.keyboard.press('Escape')
  const input = page.locator('.tui-prompt-input')
  await input.waitFor()
  for (const [command, id] of [['whoami', 'whoami'], ['cat about.txt', 'about'], ['ls', 'files'], ['cat readme.txt', 'readme'], ['./timezones.sh', 'timezones']]) {
    await input.fill(command)
    await input.press('Enter')
    await page.locator(`[data-widget="${id}"]`).waitFor()
  }
  await input.fill('./admin-login.sh')
  await input.press('Enter')
  await page.locator('[data-widget="admin-login"]').waitFor()
  await page.keyboard.press('Escape')
  await input.waitFor()
  await input.fill('./links.sh')
  await input.press('Enter')
  await nav.waitFor()
  await nav.getByRole('link', { name: /blog/ }).click()
  await page.locator('[data-widget="blog"]').waitFor()
  await page.locator('a[href^="/blog/"]').first().click()
  await page.locator('[data-widget="blog-post"] article').waitFor()
  for (const [path, id] of [['/blog/missing', 'blog-post'], ['/short', 'shorten'], ['/s', 'shorten'], ['/login', 'login'], ['/clip/example', 'clip-view'], ['/c/example', 'clip-view'], ['/s/missing', 'resolver'], ['/missing', 'clip-view']]) {
    await page.goto(origin + path)
    await page.locator(`[data-widget="${id}"]`).waitFor()
  }
  user = { email: 'widget@example.invalid', whitelisted: false, admin: false }
  await page.goto(origin + '/admin')
  await page.getByLabel('admin psk (pre-shared key)').waitFor()
  await page.goto(origin + '/clip')
  await page.getByText('your account is not whitelisted for clips.').waitFor()
  user = { email: 'widget@example.invalid', whitelisted: true, admin: true }
  await page.goto(origin)
  await nav.getByRole('link', { name: /logout/ }).waitFor()
  assert.equal(await nav.getByRole('link', { name: /login/ }).count(), 0)
  await nav.getByRole('link', { name: /clip/ }).click()
  await page.locator('[data-widget="clip"]').waitFor()
  await page.goto(origin + '/admin')
  await page.getByRole('button', { name: 'reward', exact: true }).waitFor()
  assert.equal(await page.locator('[data-widget="reward"]').count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS widget pages, aliases, shell, telemetry, account navigation, responsive layout, and private hunt exclusion')
} finally {
  await browser?.close()
  server.close()
  await once(server, 'close')
}
