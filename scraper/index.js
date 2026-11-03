import { once } from 'node:events'
import { setTimeout as sleep } from 'node:timers/promises'
import { loadConfig } from './config.js'
import { Store } from './store.js'
import { BrowserScraper } from './browser.js'
import { Worker } from './worker.js'
import { createCacheServer } from './http.js'

const config = loadConfig()
const store = new Store(config.dataDir)
const server = createCacheServer(store, config)
let stopping = false
const stop = new AbortController()
const shutdown = () => { stopping = true; stop.abort() }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

try {
  // Bind before clearing an interrupted job; a second worker must fail rather
  // than change the first worker's status. SQLite claim also protects spacing.
  server.listen(config.port, '127.0.0.1')
  await once(server, 'listening')
  store.set('activeJob', null)
  const worker = new Worker(store, new BrowserScraper(config), config)
  console.log(JSON.stringify({ event: 'started', url: `http://127.0.0.1:${server.address().port}`, paused: !!store.get('paused'), gapSeconds: config.gapMs / 1000 }))
  while (!stopping) {
    await worker.tick()
    try { await sleep(1000, undefined, { signal: stop.signal }) }
    catch (error) { if (error.name !== 'AbortError') throw error }
  }
} finally {
  if (server.listening) await new Promise(resolve => server.close(resolve))
  store.close()
}
