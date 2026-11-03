import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function appId(value) {
  const text = String(value)
  if (!/^[1-9]\d{0,9}$/.test(text) || Number(text) > 4294967295) throw new Error('Invalid Steam app ID')
  return Number(text)
}

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true })
    this.db = new DatabaseSync(resolve(directory, 'cache.sqlite'))
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS subscriptions (owner TEXT NOT NULL, app_id INTEGER NOT NULL, PRIMARY KEY(owner, app_id));
      CREATE TABLE IF NOT EXISTS games (app_id INTEGER PRIMARY KEY, name TEXT NOT NULL, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS samples (app_id INTEGER NOT NULL REFERENCES games(app_id) ON DELETE CASCADE, at INTEGER NOT NULL, players INTEGER NOT NULL, PRIMARY KEY(app_id, at));
      CREATE TABLE IF NOT EXISTS attempts (job TEXT PRIMARY KEY, attempted_at INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0, retry_at INTEGER NOT NULL DEFAULT 0, error TEXT);
    `)
  }

  close() { this.db.close() }
  get(key, fallback = null) {
    const row = this.db.prepare('SELECT value FROM state WHERE key = ?').get(key)
    return row ? JSON.parse(row.value) : fallback
  }
  set(key, value) {
    this.db.prepare('INSERT INTO state VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value))
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }

  subscribe(owner, id) {
    if (typeof owner !== 'string' || !/^[a-zA-Z0-9_.@-]{1,128}$/.test(owner)) throw new Error('Invalid owner identifier')
    this.db.prepare('INSERT OR IGNORE INTO subscriptions VALUES (?, ?)').run(owner, appId(id))
  }
  unsubscribe(owner, id) {
    this.db.prepare('DELETE FROM subscriptions WHERE owner = ? AND app_id = ?').run(owner, appId(id))
    this.prune()
  }
  subscriptions() { return this.db.prepare('SELECT owner, app_id AS appId FROM subscriptions ORDER BY owner, app_id').all() }
  trackedIds() {
    return [...new Set([...this.get('rankings', []).map(game => game.appId), ...this.subscriptions().map(game => game.appId)])]
  }
  prune() {
    const tracked = new Set(this.trackedIds())
    for (const { app_id: id } of this.db.prepare('SELECT app_id FROM games').all()) {
      if (!tracked.has(id)) {
        this.db.prepare('DELETE FROM games WHERE app_id = ?').run(id)
        this.db.prepare('DELETE FROM attempts WHERE job = ?').run(`game:${id}`)
      }
    }
    for (const { job } of this.db.prepare("SELECT job FROM attempts WHERE job LIKE 'game:%'").all()) {
      if (!tracked.has(Number(job.slice(5)))) this.db.prepare('DELETE FROM attempts WHERE job = ?').run(job)
    }
  }
  game(id) {
    const row = this.db.prepare('SELECT payload, fetched_at FROM games WHERE app_id = ?').get(appId(id))
    return row ? { ...JSON.parse(row.payload), fetchedAt: row.fetched_at } : null
  }
  saveGame(game, at) {
    if (!this.trackedIds().includes(game.appId)) return // removed while navigation was in progress
    this.db.prepare('INSERT INTO games VALUES (?, ?, ?, ?) ON CONFLICT(app_id) DO UPDATE SET name=excluded.name, payload=excluded.payload, fetched_at=excluded.fetched_at')
      .run(game.appId, game.name, JSON.stringify(game), at)
    this.db.prepare('INSERT OR REPLACE INTO samples VALUES (?, ?, ?)').run(game.appId, at, game.currentPlayers)
  }
  samples(id, since) {
    return this.db.prepare('SELECT at, players FROM samples WHERE app_id = ? AND at >= ? ORDER BY at').all(appId(id), since)
  }

  nextJob(now, refreshMs) {
    const candidates = [{ key: 'rankings', kind: 'rankings', due: this.get('rankingsAt', 0) + refreshMs }]
    for (const id of this.trackedIds()) {
      const attempt = this.db.prepare('SELECT attempted_at FROM attempts WHERE job = ?').get(`game:${id}`)
      candidates.push({ key: `game:${id}`, kind: 'game', appId: id, due: attempt ? attempt.attempted_at + refreshMs : 0 })
    }
    for (const job of candidates) {
      const attempt = this.db.prepare('SELECT retry_at FROM attempts WHERE job = ?').get(job.key)
      job.due = Math.max(job.due, attempt?.retry_at || 0)
    }
    // Cold start must discover the top ten first. After that oldest due wins,
    // so the rankings job cannot starve a growing saved-game list.
    if (!this.get('rankingsAt') && candidates[0].due <= now) return candidates[0]
    return candidates.filter(job => job.due <= now).sort((a, b) => a.due - b.due || a.key.localeCompare(b.key))[0] || null
  }

  claim(now, config) {
    // Idle and paused workers only read; avoid taking a write lock each tick.
    if (this.get('paused') || this.get('nextVisitAt', 0) > now) return null
    return this.transaction(() => {
      if (this.get('paused') || this.get('nextVisitAt', 0) > now) return null
      const job = this.nextJob(now, config.refreshMs)
      if (!job) return null
      // Reserve enough time for the whole job AND the gap. A crash/restart
      // cannot accidentally start a second visit early.
      this.set('nextVisitAt', now + config.jobTimeoutMs + config.gapMs)
      this.set('activeJob', { ...job, startedAt: now })
      this.db.prepare('INSERT INTO attempts(job, attempted_at) VALUES (?, ?) ON CONFLICT(job) DO UPDATE SET attempted_at=excluded.attempted_at').run(job.key, now)
      return job
    })
  }

  finish(job, result, error, now, config) {
    this.transaction(() => {
      this.set('activeJob', null)
      this.set('nextVisitAt', now + config.gapMs)
      if (error) {
        const failures = (this.db.prepare('SELECT failures FROM attempts WHERE job = ?').get(job.key)?.failures || 0) + 1
        const delay = Math.min(86400000, config.refreshMs * 2 ** Math.min(failures - 1, 8))
        this.db.prepare('UPDATE attempts SET failures=?, retry_at=?, error=? WHERE job=?').run(failures, now + delay, error.code || 'scrape_failed', job.key)
        this.set('lastError', { at: now, job: job.key, code: error.code || 'scrape_failed', message: error.message })
        if (['source_blocked', 'source_challenge'].includes(error.code)) this.set('paused', { at: now, reason: error.code, message: error.message })
      } else {
        this.db.prepare('UPDATE attempts SET failures=0, retry_at=0, error=NULL WHERE job=?').run(job.key)
        if (job.kind === 'rankings') {
          this.set('rankings', result.games)
          this.set('rankingsAt', now)
          // A rankings visit provides fresh numeric summaries for the top ten.
          // It does not pretend to have retrieved their individual chart data.
          for (const game of result.games) {
            const previous = this.game(game.appId)
            this.saveGame({ ...previous, ...game, source: 'steamdb', sourceUrl: `https://steamdb.info/app/${game.appId}/charts/`, series: previous?.series || [], historyStatus: previous?.historyStatus || 'not_fetched', chartFetchedAt: previous?.chartFetchedAt || null }, now)
          }
          this.prune()
        } else {
          const previous = this.game(job.appId)
          const hasHistory = result.series?.length > 0
          this.saveGame({
            ...result,
            series: hasHistory ? result.series : previous?.series || [],
            historyStatus: hasHistory ? 'available' : previous?.series?.length ? 'stale' : 'unavailable',
            chartFetchedAt: hasHistory ? now : previous?.chartFetchedAt || null,
            chartCheckedAt: now,
          }, now)
        }
        this.set('lastSuccessAt', now)
      }
      this.db.prepare('DELETE FROM samples WHERE at < ?').run(now - config.retentionMs)
    })
  }
}
