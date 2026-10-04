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
  const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name)
  if (!columns('reward_campaigns').includes('winner_user_id')) {
    const legacy = db.prepare("SELECT expires_at FROM reward_campaigns WHERE state='reserved'").get()
    if (legacy?.expires_at > Date.now()) throw new Error('Wait for the legacy reward recovery window before migrating')
    db.exec('ALTER TABLE reward_campaigns ADD COLUMN winner_user_id INTEGER')
  }
  if (!columns('reward_tokens').includes('user_id')) db.exec('ALTER TABLE reward_tokens ADD COLUMN user_id INTEGER')
  if (!columns('reward_tokens').includes('purpose')) db.exec("ALTER TABLE reward_tokens ADD COLUMN purpose TEXT NOT NULL DEFAULT 'legacy' CHECK (purpose IN ('legacy','claim','view'))")
  if (!db.prepare('SELECT 1 FROM reward_campaigns WHERE id = 1').get()) {
    let slug
    do { slug = randomBytes(16).toString('base64url') } while (pathTaken(slug))
    db.prepare('INSERT OR IGNORE INTO reward_campaigns (id, slug) VALUES (1, ?)').run(slug)
  }
  const get = db.prepare('SELECT * FROM reward_campaigns WHERE id = 1')
  const expire = db.prepare("UPDATE reward_campaigns SET state = 'closed' WHERE state = 'reserved' AND expires_at <= ?")
  const token = db.prepare('SELECT * FROM reward_tokens WHERE hash = ? AND expires_at > ?')
  const insert = db.prepare('INSERT INTO reward_tokens (hash, expires_at, user_id, purpose) VALUES (?, ?, ?, ?)')
  const user = db.prepare('SELECT id FROM users WHERE id = ?')
  const validUser = (id) => Number.isSafeInteger(id) && id > 0 && !!user.get(id)
  const prune = db.prepare('DELETE FROM reward_tokens WHERE expires_at <= ?')
  const reserve = db.prepare("UPDATE reward_campaigns SET state = 'reserved', winner_hash = ?, winner_user_id = ?, claimed_at = ?, expires_at = ? WHERE id = 1 AND state = 'armed'")
  const arm = db.prepare("UPDATE reward_campaigns SET state = 'armed', armed_at = ? WHERE id = 1 AND state = 'disarmed'")
  const ack = db.prepare("UPDATE reward_campaigns SET state = 'closed', acknowledged_at = ? WHERE state = 'reserved' AND winner_hash = ? AND winner_user_id = ?")

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
  function status(hash, userId = null, now = Date.now()) {
    const row = snapshot(now)
    const authenticated = validUser(userId)
    const proof = hash ? token.get(hash, now) : null
    if (row.state === 'reserved' && hash === row.winner_hash) {
      if (!authenticated || row.winner_user_id !== userId) return { state: 'login_required', reward_available: false, recovery: true }
      return { state: 'winner', expires_at: row.expires_at, server_now: now }
    }
    if (row.state === 'armed') {
      if (!authenticated) return { state: 'login_required', reward_available: true }
      return proof?.purpose === 'claim' && proof.user_id === userId
        ? { state: 'available' }
        : { state: 'password_required', reward_available: true }
    }
    const mayView = proof?.purpose === 'view' || (proof?.purpose === 'claim' && authenticated && proof.user_id === userId)
    return mayView ? { state: 'consolation' } : { state: 'password_required', reward_available: false }
  }
  return {
    snapshot,
    matches: (slug) => get.get().slug === slug,
    status,
    issue(existingHash, userId = null, now = Date.now()) {
      return transaction(() => {
        const row = snapshot(now)
        // Preserve a winning receipt; signing back into its account restores access.
        if (row.state === 'reserved' && existingHash && row.winner_hash === existingHash) return null
        if (row.state === 'armed' && !validUser(userId)) return null
        const purpose = row.state === 'armed' ? 'claim' : 'view'
        const owner = purpose === 'claim' ? userId : null
        const existing = existingHash ? token.get(existingHash, now) : null
        if (existing?.purpose === purpose && existing.user_id === owner) return null
        prune.run(now)
        const raw = randomBytes(32).toString('base64url')
        insert.run(tokenHash(raw), now + TOKEN_MS, owner, purpose)
        return raw
      })
    },
    arm(now = Date.now()) {
      snapshot(now)
      return arm.run(now).changes === 1
    },
    claim(hash, userId = null, now = Date.now()) {
      return transaction(() => {
        let row = snapshot(now)
        if (!validUser(userId)) return { state: 'login_required', reward_available: row.state === 'armed' }
        const proof = hash ? token.get(hash, now) : null
        if (row.state === 'armed' && proof?.purpose === 'claim' && proof.user_id === userId) {
          reserve.run(hash, userId, now, now + RECOVERY_MS)
          row = get.get()
        }
        if (row.state === 'reserved' && hash && row.winner_hash === hash && row.winner_user_id === userId) {
          return { state: 'winner', phrase: FAKE_PHRASE, alpha: true, expires_at: row.expires_at, server_now: now }
        }
        return status(hash, userId, now)
      })
    },
    acknowledge(hash, userId = null, now = Date.now()) {
      return transaction(() => {
        const row = snapshot(now)
        if (!validUser(userId) || !hash || row.winner_hash !== hash || row.winner_user_id !== userId) return false
        ack.run(now, hash, userId)
        return true
      })
    },
  }
}
