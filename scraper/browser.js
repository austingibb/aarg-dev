import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import { extractSteamDb, validateResult } from './extract.js'

export class BrowserScraper {
  constructor(config) { this.config = config }

  async connect(signal) {
    const config = this.config
    try { return await chromium.connectOverCDP(config.cdpUrl, { timeout: 3000 }) }
    catch {
      signal.throwIfAborted()
      if (!config.launchChrome) throw Object.assign(new Error('Chrome CDP is unavailable'), { code: 'browser_unavailable' })
    }
    await mkdir(config.profileDir, { recursive: true })
    const args = [
      `--remote-debugging-port=${new URL(config.cdpUrl).port || 80}`,
      '--remote-debugging-address=127.0.0.1', `--user-data-dir=${config.profileDir}`,
      '--no-first-run', '--no-default-browser-check',
      ...(config.headless ? ['--headless=new'] : []), 'about:blank',
    ]
    let launchError
    const child = spawn(config.chromePath, args, { windowsHide: true, stdio: 'ignore' })
    child.on('error', error => { launchError = error })
    child.unref()
    for (let i = 0; i < 10; i++) {
      await sleep(500, undefined, { signal })
      if (launchError) break
      try { return await chromium.connectOverCDP(config.cdpUrl, { timeout: 1000 }) } catch { /* still starting */ }
    }
    throw Object.assign(new Error('Could not start or connect to dedicated Chrome'), { code: 'browser_unavailable' })
  }

  async scrape(job) {
    const controller = new AbortController()
    let browser, page
    const timer = setTimeout(() => {
      controller.abort(new Error('Scrape time limit exceeded'))
      // Close only our own tab to interrupt a stuck navigation/evaluation.
      page?.close().catch(() => {})
    }, this.config.jobTimeoutMs)
    try {
      browser = await this.connect(controller.signal)
      controller.signal.throwIfAborted()
      page = await browser.contexts()[0].newPage()
      page.setDefaultTimeout(5000)
      controller.signal.throwIfAborted()
      const url = job.kind === 'rankings' ? 'https://steamdb.info/charts/' : `https://steamdb.info/app/${job.appId}/charts/`
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.config.navigationTimeoutMs })
      const status = response?.status()
      let result = await page.evaluate(extractSteamDb, job)
      if (['source_blocked', 'source_challenge'].includes(result?.error)) return validateResult(result, job)
      if ([401, 403, 429].includes(status)) throw Object.assign(new Error(`SteamDB returned HTTP ${status}; automatic visits paused`), { code: 'source_blocked' })
      if (!response || status >= 400) throw Object.assign(new Error(`SteamDB HTTP ${status || 'unknown'}`), { code: 'upstream_error' })
      // Give the page's normal chart initialization a bounded opportunity to
      // finish. Do not click range controls or issue our own chart requests.
      if (job.kind === 'game' || result?.error) {
        await sleep(5000, undefined, { signal: controller.signal })
        result = await page.evaluate(extractSteamDb, job)
      }
      return validateResult(result, job)
    } finally {
      clearTimeout(timer)
      await page?.close().catch(() => {})
      // On an attached browser this disconnects Playwright; Chrome stays up.
      await browser?.close().catch(() => {})
    }
  }
}
