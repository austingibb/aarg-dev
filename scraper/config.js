import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))

function integer(value, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`Expected integer between ${min} and ${max}`)
  return number
}

export function loadConfig(env = process.env) {
  const cdpUrl = new URL(env.STEAMDB_CDP_URL || 'http://127.0.0.1:9222')
  if (cdpUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(cdpUrl.hostname) || cdpUrl.username || cdpUrl.password || cdpUrl.pathname !== '/' || cdpUrl.search || cdpUrl.hash) {
    throw new Error('STEAMDB_CDP_URL must be a loopback HTTP origin')
  }
  const dataDir = resolve(env.STEAMDB_DATA_DIR || resolve(projectRoot, 'data/steamdb-scraper'))
  return {
    dataDir,
    cdpUrl: cdpUrl.origin,
    chromePath: env.STEAMDB_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    profileDir: resolve(dataDir, 'chrome-profile'),
    launchChrome: env.STEAMDB_LAUNCH_CHROME !== '0',
    headless: env.STEAMDB_HEADLESS !== '0',
    port: integer(env.STEAMDB_PORT, 4175, 0, 65535),
    // Five minutes is a hard minimum even if an environment variable is mistyped.
    gapMs: integer(env.STEAMDB_GAP_SECONDS, 300, 300, 86400) * 1000,
    refreshMs: integer(env.STEAMDB_REFRESH_SECONDS, 3600, 3600, 604800) * 1000,
    retentionMs: integer(env.STEAMDB_RETENTION_DAYS, 30, 1, 365) * 86400000,
    navigationTimeoutMs: 45000,
    jobTimeoutMs: 90000,
  }
}
