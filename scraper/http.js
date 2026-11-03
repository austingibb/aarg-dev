import { createServer } from 'node:http'
import { appId } from './store.js'

export function createCacheServer(store, config) {
  return createServer((req, res) => {
    const send = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(data))
    }
    // Read-only loopback API, intended for the future site's backend.
    // Do not expose this port through nginx or Cloudflare.
    if (req.method !== 'GET') return send(405, { error: 'read_only' })
    try {
      const url = new URL(req.url, 'http://localhost')
      const now = Date.now()
      if (url.pathname === '/health') {
        const paused = store.get('paused')
        return send(200, {
          status: paused ? 'paused' : store.get('lastSuccessAt') ? 'running' : 'warming_up',
          paused, activeJob: store.get('activeJob'), nextVisitAt: store.get('nextVisitAt', 0),
          lastSuccessAt: store.get('lastSuccessAt'), lastError: store.get('lastError'),
          trackedGames: store.trackedIds().length, cachedGames: store.db.prepare('SELECT count(*) AS n FROM games').get().n,
          gapSeconds: config.gapMs / 1000, targetRefreshSeconds: config.refreshMs / 1000,
        })
      }
      if (url.pathname === '/top') {
        const fetchedAt = store.get('rankingsAt')
        if (!fetchedAt) return send(503, { error: 'not_cached', paused: !!store.get('paused') })
        const limit = url.searchParams.get('limit') ?? '10'
        if (!/^(?:[1-9]|10)$/.test(limit)) return send(400, { error: 'limit_must_be_1_to_10' })
        return send(200, { source: 'steamdb', fetchedAt, stale: now - fetchedAt > config.refreshMs, games: store.get('rankings', []).slice(0, Number(limit)) })
      }
      const match = /^\/games\/([^/]+)$/.exec(url.pathname)
      if (match) {
        let id
        try { id = appId(match[1]) } catch { return send(400, { error: 'invalid_app_id' }) }
        if (!store.trackedIds().includes(id)) return send(404, { error: 'not_tracked' })
        const game = store.game(id)
        if (!game) return send(503, { error: 'not_cached', appId: id, paused: !!store.get('paused') })
        return send(200, { ...game, stale: now - game.fetchedAt > config.refreshMs,
          historyStale: game.historyStatus === 'stale' || !game.chartFetchedAt || now - game.chartFetchedAt > config.refreshMs,
          observations: { source: 'local_samples', points: store.samples(id, now - config.retentionMs) } })
      }
      return send(404, { error: 'not_found' })
    } catch {
      return send(500, { error: 'cache_error' })
    }
  })
}
