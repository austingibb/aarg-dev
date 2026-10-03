/* Alpha only: no wallet import, real seed, balance lookup or payout code. */
import { createHash, randomBytes } from 'node:crypto'

export const RECOVERY_MS = 60 * 60 * 1000
export const TOKEN_MS = 24 * RECOVERY_MS
export const FAKE_PHRASE = 'TEST-ONLY / battery goblin confetti coupon doge bonanza / NOT-A-WALLET'
export const tokenHash = (value) => createHash('sha256').update(value).digest('hex')

export function createRewardStore(db, pathTaken = () => false) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reward_campaigns (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      slug TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'disarmed' CHECK (state IN ('disarmed','armed','reserved','closed')),
      winner_hash TEXT, armed_at INTEGER, claimed_at INTEGER,
      expires_at INTEGER, acknowledged_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS reward_tokens (
      hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reward_token_expiry ON reward_tokens(expires_at);
  `)
  if (!db.prepare('SELECT 1 FROM reward_campaigns WHERE id = 1').get()) {
    let slug
    do { slug = randomBytes(16).toString('base64url') } while (pathTaken(slug))
    db.prepare('INSERT OR IGNORE INTO reward_campaigns (id, slug) VALUES (1, ?)').run(slug)
  }
  const get = db.prepare('SELECT * FROM reward_campaigns WHERE id = 1')
  const expire = db.prepare("UPDATE reward_campaigns SET state = 'closed' WHERE state = 'reserved' AND expires_at <= ?")
  const token = db.prepare('SELECT * FROM reward_tokens WHERE hash = ? AND expires_at > ?')
  const insert = db.prepare('INSERT INTO reward_tokens VALUES (?, ?)')
  const prune = db.prepare('DELETE FROM reward_tokens WHERE expires_at <= ?')
  const reserve = db.prepare("UPDATE reward_campaigns SET state = 'reserved', winner_hash = ?, claimed_at = ?, expires_at = ? WHERE id = 1 AND state = 'armed'")
  const arm = db.prepare("UPDATE reward_campaigns SET state = 'armed', armed_at = ? WHERE id = 1 AND state = 'disarmed'")
  const ack = db.prepare("UPDATE reward_campaigns SET state = 'closed', acknowledged_at = ? WHERE state = 'reserved' AND winner_hash = ?")

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  function snapshot(now = Date.now()) {
    expire.run(now)
    return get.get()
  }
  function status(hash, now = Date.now()) {
    const row = snapshot(now)
    if (row.state === 'reserved' && hash === row.winner_hash) {
      return { state: 'winner', expires_at: row.expires_at, server_now: now }
    }
    if (row.state !== 'armed') return { state: 'consolation' }
    return { state: hash && token.get(hash, now) ? 'available' : 'locked' }
  }
  return {
    snapshot,
    matches: (slug) => get.get().slug === slug,
    status,
    issue(existingHash, now = Date.now()) {
      const row = snapshot(now)
      // Never overwrite the winning cookie, including after its deadline.
      if (existingHash && (row.winner_hash === existingHash || token.get(existingHash, now))) return null
      if (row.state !== 'armed') return null
      prune.run(now)
      const raw = randomBytes(32).toString('base64url')
      // Retain enough lifetime for a claim at the end of the eligibility period.
      insert.run(tokenHash(raw), now + TOKEN_MS)
      return raw
    },
    arm(now = Date.now()) {
      snapshot(now)
      return arm.run(now).changes === 1
    },
    claim(hash, now = Date.now()) {
      return transaction(() => {
        let row = snapshot(now)
        if (row.state === 'armed' && hash && token.get(hash, now)) {
          reserve.run(hash, now, now + RECOVERY_MS)
          row = get.get()
        }
        if (row.state === 'reserved' && hash && row.winner_hash === hash) {
          return { state: 'winner', phrase: FAKE_PHRASE, alpha: true, expires_at: row.expires_at, server_now: now }
        }
        return status(hash, now)
      })
    },
    acknowledge(hash, now = Date.now()) {
      return transaction(() => {
        const row = snapshot(now)
        if (!hash || row.winner_hash !== hash) return false
        ack.run(now, hash)
        return true
      })
    },
  }
}
