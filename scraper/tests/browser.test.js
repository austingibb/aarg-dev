import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'
import { BrowserScraper } from '../browser.js'
import { loadConfig } from '../config.js'

test('real Chrome CDP extracts local ranking/chart fixtures and pauses on blocked pages', { timeout: 45000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aarg-scraper-browser-'))
  let context
  try {
    const config = loadConfig({ STEAMDB_CHROME_PATH: process.env.STEAMDB_TEST_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
    context = await chromium.launchPersistentContext(directory, { executablePath: config.chromePath, headless: true, args: ['--remote-debugging-port=0'], serviceWorkers: 'block' })
    const [port] = (await readFile(join(directory, 'DevToolsActivePort'), 'utf8')).split('\n')
    const scraper = new BrowserScraper({ ...config, cdpUrl: `http://127.0.0.1:${port}`, launchChrome: false })
    let mode = 'rankings'
    let visits = 0
    const originalConnect = scraper.connect.bind(scraper)
    scraper.connect = async signal => {
      const browser = await originalConnect(signal)
      await browser.contexts()[0].route('**/*', route => {
        if (route.request().resourceType() !== 'document') return route.abort()
        visits++
        let body
        if (mode === 'rankings') {
          body = '<table><thead><tr><th>Rank</th><th></th><th>Name</th><th>Current</th><th>24h Peak</th><th>All-Time Peak</th></tr></thead><tbody>' +
            Array.from({ length: 12 }, (_, i) => `<tr><td>${i + 1}</td><td><a href="/app/${100 + i}/"><img></a></td><td><a href="/app/${100 + i}/">Game ${i}</a></td><td>${(12000 - i).toLocaleString('en-US')}</td><td>15,000</td><td>20,000</td></tr>`).join('') + '</tbody></table>'
        } else if (mode === 'game') {
          body = `<h1>Fixture Game</h1><div>1,234 players right now</div><div>2,345 24-hour peak</div><div>3,456 all-time peak</div>
            <script>window.Highcharts = { charts: [{ series: [
              { name: 'Players', options: { data: [[1800000000000, 1234], [1800000300000, 1250], [1800000600000, null]] } },
              { name: 'Twitch viewers', options: { data: [[1800000000000, 999]] } }
            ] }] };</script>`
        } else if (mode === 'blocked') body = '<h1>You have been banned on SteamDB</h1>'
        else body = '<title>Just a moment...</title><h1>Verify you are human</h1>'
        return route.fulfill({ status: mode === 'blocked' ? 403 : 200, contentType: 'text/html', body })
      })
      return browser
    }
    const rankings = await scraper.scrape({ kind: 'rankings', key: 'rankings' })
    assert.equal(rankings.games.length, 10)
    assert.equal(rankings.games[0].currentPlayers, 12000)
    assert.equal(rankings.games[0].name, 'Game 0')
    mode = 'game'
    const game = await scraper.scrape({ kind: 'game', key: 'game:100', appId: 100 })
    assert.equal(game.currentPlayers, 1234)
    assert.equal(game.peak24h, 2345)
    assert.equal(game.allTimePeak, 3456)
    assert.equal(game.series.length, 1)
    assert.equal(game.series[0].points.length, 2)
    mode = 'blocked'
    await assert.rejects(scraper.scrape({ kind: 'rankings' }), { code: 'source_blocked' })
    mode = 'challenge'
    await assert.rejects(scraper.scrape({ kind: 'rankings' }), { code: 'source_challenge' })
    assert.equal(visits, 4, 'one navigation per job, all fulfilled locally')
  } finally {
    await context?.close()
    assert.ok(resolve(directory).startsWith(resolve(tmpdir(), 'aarg-scraper-browser-')))
    await rm(directory, { recursive: true, force: true })
  }
})
