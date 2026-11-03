import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { once } from 'node:events'
import { Store, appId } from '../store.js'
import { Worker } from '../worker.js'
import { loadConfig } from '../config.js'
import { createCacheServer } from '../http.js'
import { validateResult } from '../extract.js'

const start = 1800000000000
const config = { gapMs: 300000, refreshMs: 3600000, jobTimeoutMs: 90000, retentionMs: 86400000 }
const games = Array.from({ length: 10 }, (_, i) => ({ appId: i + 1, name: `Game ${i + 1}`, currentPlayers: 1000 - i, peak24h: 1500, allTimePeak: 2000 }))
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'aarg-scraper-test-'))
  const store = new Store(directory)
  t.after(() => {
    store.close()
    assert.ok(resolve(directory).startsWith(resolve(tmpdir(), 'aarg-scraper-test-')))
    rmSync(directory, { recursive: true, force: true })
  })
  return { store, directory }
}

test('strict loopback configuration and a hard five-minute visit minimum', () => {
  assert.equal(loadConfig({}).gapMs, 300000)
  assert.throws(() => loadConfig({ STEAMDB_GAP_SECONDS: '299' }))
  assert.throws(() => loadConfig({ STEAMDB_CDP_URL: 'http://example.com:9222' }))
  assert.throws(() => loadConfig({ STEAMDB_CDP_URL: 'http://user:pass@localhost:9222' }))
  assert.throws(() => loadConfig({ STEAMDB_PORT: 'NaN' }))
  assert.equal(appId('730'), 730)
  for (const value of ['0', '-1', '1e3', '730/path', '4294967296']) assert.throws(() => appId(value))
})

test('one visit at a time; spacing survives another process and restart', async t => {
  const { store, directory } = fixture(t)
  let now = start
  let release
  const worker = new Worker(store, { scrape: () => new Promise(resolve => { release = resolve }) }, config, { now: () => now, log: () => {} })
  const first = worker.tick()
  assert.equal(await worker.tick(), false)
  const other = new Store(directory)
  try { assert.equal(other.claim(now, config), null) } finally { other.close() }
  now += 1000
  release({ games })
  await first
  assert.equal(store.trackedIds().length, 10)
  assert.equal(store.claim(now + 299999, config), null)
  const reopened = new Store(directory)
  try {
    const job = reopened.claim(now + 300000, config)
    assert.equal(job.kind, 'game')
    // Simulate a crash after claim; reserved job budget plus gap survives.
    assert.equal(reopened.claim(now + 300001, config), null)
  } finally { reopened.close() }
})

test('top ten and all subscriptions form a deduplicated set, pruning only unneeded games', t => {
  const { store } = fixture(t)
  store.subscribe('alice', 1)
  store.subscribe('bob', 1)
  store.subscribe('alice', 99)
  store.subscribe('alice', 99)
  const job = store.claim(start, config)
  store.finish(job, { games }, null, start, config)
  assert.equal(store.trackedIds().length, 11)
  assert.equal(store.subscriptions().length, 3)
  store.saveGame({ ...games[0], appId: 99 }, start)
  store.unsubscribe('alice', 1)
  assert.ok(store.game(1))
  store.unsubscribe('alice', 99)
  assert.equal(store.game(99), null)
  assert.deepEqual(store.samples(99, 0), [])
  store.finish({ key: 'rankings', kind: 'rankings' }, { games: games.map(game => ({ ...game, appId: game.appId + 100 })) }, null, start + 3600000, config)
  assert.ok(store.game(1), 'bob still tracks game 1')
  assert.equal(store.game(2), null, 'game 2 is no longer saved or in the top ten')
})

test('queue makes progress when game count exceeds the hourly budget', t => {
  const { store } = fixture(t)
  for (let id = 20; id < 40; id++) store.subscribe('owner', id)
  const visits = new Map()
  let now = start
  for (let i = 0; i < 65; i++) {
    const job = store.claim(now, config)
    assert.ok(job)
    visits.set(job.key, (visits.get(job.key) || 0) + 1)
    const result = job.kind === 'rankings' ? { games } : { ...games[0], appId: job.appId, series: [], historyStatus: 'unavailable' }
    store.finish(job, result, null, now, config)
    now += config.gapMs
  }
  for (const id of store.trackedIds()) assert.ok(visits.get(`game:${id}`) >= 2, `game ${id} not starved`)
  assert.ok(visits.get('rankings') >= 2)
})

test('a source block preserves good cache and pauses all automatic visits across restart', async t => {
  const { store, directory } = fixture(t)
  store.finish(store.claim(start, config), { games }, null, start, config)
  const error = Object.assign(new Error('IP blocked'), { code: 'source_blocked' })
  const worker = new Worker(store, { scrape: async () => { throw error } }, config, { now: () => start + config.gapMs, log: () => {} })
  await worker.tick()
  assert.equal(store.game(1).currentPlayers, 1000)
  assert.equal(store.get('paused').reason, 'source_blocked')
  const reopened = new Store(directory)
  try { assert.equal(reopened.claim(start + 86400000, config), null) } finally { reopened.close() }
})

test('transient errors back off the failed job without erasing data or blocking other games', t => {
  const { store } = fixture(t)
  store.finish(store.claim(start, config), { games }, null, start, config)
  const job = store.claim(start + config.gapMs, config)
  store.finish(job, null, new Error('timeout'), start + config.gapMs, config)
  assert.equal(store.get('paused'), null)
  const next = store.claim(start + config.gapMs * 2, config)
  assert.notEqual(next.key, job.key)
  assert.equal(store.game(job.appId).currentPlayers, 1001 - job.appId)
})

test('invalid or partial extraction is rejected; zero players is a valid count', () => {
  assert.throws(() => validateResult({ games: games.slice(0, 9) }, { kind: 'rankings' }), /invalid rankings/)
  assert.throws(() => validateResult({ games: Array(10).fill(games[0]) }, { kind: 'rankings' }))
  assert.throws(() => validateResult({ ...games[0], currentPlayers: -1 }, { kind: 'game', appId: 1 }))
  assert.throws(() => validateResult({ error: 'source_challenge' }, { kind: 'rankings' }), /source challenge/)
  assert.equal(validateResult({ ...games[0], currentPlayers: 0 }, { kind: 'game', appId: 1 }).currentPlayers, 0)
})

test('a fresh summary without chart data preserves older series and its actual fetch time', t => {
  const { store } = fixture(t)
  store.finish(store.claim(start, config), { games }, null, start, config)
  const job = store.claim(start + config.gapMs, config)
  const result = { ...games.find(game => game.appId === job.appId), series: [{ name: 'Players', points: [{ at: start, players: 123 }] }] }
  store.finish(job, result, null, start + config.gapMs, config)
  const chartFetchedAt = store.game(job.appId).chartFetchedAt
  const later = start + 3600000
  store.finish(job, { ...result, currentPlayers: 500, series: [], historyStatus: 'unavailable' }, null, later, config)
  const cached = store.game(job.appId)
  assert.equal(cached.currentPlayers, 500)
  assert.equal(cached.fetchedAt, later)
  assert.equal(cached.chartFetchedAt, chartFetchedAt)
  assert.equal(cached.historyStatus, 'stale')
  assert.deepEqual(cached.series, result.series)
})

test('cache API serves structured data, distinguishes cold/stale/untracked, and cannot trigger scraping', async t => {
  const { store } = fixture(t)
  const server = createCacheServer(store, config)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    assert.equal((await fetch(base + '/top')).status, 503)
    assert.equal((await fetch(base + '/games/999')).status, 404)
    assert.equal((await fetch(base + '/games/not-an-id')).status, 400)
    assert.equal((await fetch(base + '/resume', { method: 'POST' })).status, 405)
    store.subscribe('owner', 999)
    assert.equal((await fetch(base + '/games/999')).status, 503)
    const old = Date.now() - 7200000
    store.finish(store.claim(old, config), { games }, null, old, config)
    const top = await (await fetch(base + '/top?limit=3')).json()
    assert.equal(top.games.length, 3)
    assert.equal(top.stale, true)
    assert.equal((await fetch(base + '/top?limit=100')).status, 400)
    const game = await (await fetch(base + '/games/1')).json()
    assert.equal(game.historyStatus, 'not_fetched')
    assert.equal(game.observations.source, 'local_samples')
    assert.equal(game.observations.points.length, 1)
    assert.equal((await (await fetch(base + '/health')).json()).cachedGames, 10)
    assert.equal(store.get('activeJob'), null)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
