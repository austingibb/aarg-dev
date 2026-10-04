import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createRewardStore, tokenHash, RECOVERY_MS, TOKEN_MS, FAKE_PHRASE } from '../server/reward-store.js'

function fixture(t) {
  const db = new DatabaseSync(':memory:')
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1), (2)')
  t.after(() => db.close())
  return { db, store: createRewardStore(db) }
}

test('guests must prove the password to view; view tokens cannot claim after arming', (t) => {
  const { store } = fixture(t)
  const slug = store.snapshot().slug
  assert.match(slug, /^[\w-]{22}$/)
  assert.equal(store.status(null).state, 'password_required')
  const view = tokenHash(store.issue(null))
  assert.equal(store.status(view).state, 'consolation')
  assert.equal(store.arm(), true)
  assert.equal(store.arm(), false)
  assert.equal(store.snapshot().slug, slug)
  assert.equal(store.issue(null), null)
  assert.equal(store.claim(view).state, 'login_required')
  assert.equal(store.claim(view, 1).state, 'password_required')
})

test('tokens and winner require the same existing account; fixed deadline and no rearm', (t) => {
  const { store } = fixture(t)
  store.arm(1000)
  const first = tokenHash(store.issue(null, 1, 1000))
  const second = tokenHash(store.issue(null, 2, 1000))
  assert.equal(store.issue(first, 1, 1001), null)
  assert.equal(store.claim(first, 2, 1500).state, 'password_required')
  assert.equal(store.claim(first, null, 1500).state, 'login_required')
  assert.equal(store.claim(first, 1, 2000).phrase, FAKE_PHRASE)
  assert.equal(store.claim(second, 2, 2000).state, 'consolation')
  assert.equal(store.claim(first, 2, 2100).phrase, undefined)
  assert.equal(store.claim(first, 1, 2500).expires_at, 2000 + RECOVERY_MS)
  assert.equal(store.claim(first, 1, 2000 + RECOVERY_MS - 1).phrase, FAKE_PHRASE)
  assert.equal(store.claim(first, 1, 2000 + RECOVERY_MS).phrase, undefined)
  assert.equal(store.snapshot(2000 + RECOVERY_MS).state, 'closed')
  assert.equal(store.arm(2000 + RECOVERY_MS), false)
})

test('acknowledgment requires both credentials, is retryable and permanently closes', (t) => {
  const { store } = fixture(t)
  store.arm(1000)
  const winner = tokenHash(store.issue(null, 1, 1000))
  store.claim(winner, 1, 1000)
  assert.equal(store.acknowledge('wrong', 1, 1100), false)
  assert.equal(store.acknowledge(winner, 2, 1100), false)
  assert.equal(store.acknowledge(winner, null, 1100), false)
  assert.equal(store.acknowledge(winner, 1, 1200), true)
  assert.equal(store.acknowledge(winner, 1, 1300), true)
  assert.equal(store.claim(winner, 1, 1400).phrase, undefined)
  assert.equal(store.snapshot(1500).acknowledged_at, 1200)
})

test('expired eligibility cannot claim; late winner still has the full recovery hour', (t) => {
  const { store } = fixture(t)
  store.arm(1000)
  const expired = tokenHash(store.issue(null, 1, 1000))
  assert.equal(store.claim(expired, 1, 1000 + TOKEN_MS).state, 'password_required')
  const fresh = tokenHash(store.issue(null, 1, 1000 + TOKEN_MS))
  const claimedAt = 1000 + 2 * TOKEN_MS - 1
  assert.equal(store.claim(fresh, 1, claimedAt).phrase, FAKE_PHRASE)
  assert.equal(store.claim(fresh, 1, claimedAt + RECOVERY_MS - 1).phrase, FAKE_PHRASE)
})

test('restart preserves account ownership; deleting the account denies recovery', (t) => {
  const { store, db } = fixture(t)
  store.arm(1000)
  const winner = tokenHash(store.issue(null, 1, 1000))
  const result = store.claim(winner, 1, 1100)
  const restored = createRewardStore(db)
  assert.equal(restored.snapshot(1200).slug, store.snapshot(1200).slug)
  assert.equal(restored.claim(winner, 1, 1300).expires_at, result.expires_at)
  db.exec('DELETE FROM users WHERE id=1')
  assert.equal(restored.claim(winner, 1, 1400).state, 'login_required')
  assert.equal(restored.acknowledge(winner, 1, 1400), false)
  assert.equal(restored.snapshot(1400).state, 'reserved')
})

test('old anonymous tokens cannot claim after the additive migration', (t) => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY); INSERT INTO users VALUES (1);
    CREATE TABLE reward_campaigns (id INTEGER PRIMARY KEY, slug TEXT, state TEXT, winner_hash TEXT, armed_at INTEGER, claimed_at INTEGER, expires_at INTEGER, acknowledged_at INTEGER);
    INSERT INTO reward_campaigns (id,slug,state) VALUES (1,'abcdefghijklmnopqrstuv','armed');
    CREATE TABLE reward_tokens (hash TEXT PRIMARY KEY, expires_at INTEGER);
    INSERT INTO reward_tokens VALUES ('old-anonymous-token',9999999999999);`)
  const store = createRewardStore(db)
  assert.equal(store.claim('old-anonymous-token', 1).state, 'password_required')
  assert.equal(store.snapshot().slug, 'abcdefghijklmnopqrstuv')
  assert.equal(store.snapshot().state, 'armed')
})
