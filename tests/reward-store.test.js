import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { createRewardStore, tokenHash, RECOVERY_MS, TOKEN_MS, FAKE_PHRASE } from '../server/reward-store.js'

function fixture(t) {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  return { db, store: createRewardStore(db) }
}

test('disarmed by default; arming does not rotate the physical link', (t) => {
  const { store } = fixture(t)
  const slug = store.snapshot().slug
  assert.match(slug, /^[\w-]{22}$/)
  assert.deepEqual(store.status(null), { state: 'consolation' })
  assert.equal(store.issue(null), null)
  assert.equal(store.arm(), true)
  assert.equal(store.arm(), false)
  assert.equal(store.snapshot().slug, slug)
  assert.deepEqual(store.claim(null), { state: 'locked' })
})

test('one winner, token reuse, fixed deadline, exact expiry, no rearm', (t) => {
  const { store } = fixture(t)
  store.arm(1000)
  const first = tokenHash(store.issue(null, 1000))
  const second = tokenHash(store.issue(null, 1000))
  assert.equal(store.issue(first, 1001), null)
  assert.equal(store.claim(first, 2000).phrase, FAKE_PHRASE)
  assert.equal(store.claim(second, 2000).state, 'consolation')
  assert.equal(store.claim(first, 2500).expires_at, 2000 + RECOVERY_MS)
  assert.equal(store.claim(first, 2000 + RECOVERY_MS - 1).phrase, FAKE_PHRASE)
  assert.equal(store.claim(first, 2000 + RECOVERY_MS).phrase, undefined)
  assert.equal(store.snapshot(2000 + RECOVERY_MS).state, 'closed')
  assert.equal(store.arm(2000 + RECOVERY_MS), false)
})

test('acknowledgment is winner-only, retryable, and permanently ends reveal', (t) => {
  const { store } = fixture(t)
  store.arm(1000)
  const winner = tokenHash(store.issue(null, 1000))
  store.claim(winner, 1000)
  assert.equal(store.acknowledge('wrong', 1100), false)
  assert.equal(store.acknowledge(winner, 1200), true)
  assert.equal(store.acknowledge(winner, 1300), true)
  assert.equal(store.claim(winner, 1400).phrase, undefined)
  assert.equal(store.snapshot(1500).acknowledged_at, 1200)
  assert.equal(store.arm(1600), false)
})

test('expired eligibility token cannot claim, but a late winner gets a full hour', (t) => {
  const { store } = fixture(t)
  store.arm(1000)
  const expired = tokenHash(store.issue(null, 1000))
  assert.equal(store.claim(expired, 1000 + TOKEN_MS).state, 'locked')
  const fresh = tokenHash(store.issue(null, 1000 + TOKEN_MS))
  const claimedAt = 1000 + 2 * TOKEN_MS - 1
  assert.equal(store.claim(fresh, claimedAt).phrase, FAKE_PHRASE)
  assert.equal(store.claim(fresh, claimedAt + RECOVERY_MS - 1).phrase, FAKE_PHRASE)
})

test('reinitializing preserves slug, reservation and deadline', (t) => {
  const { store, db } = fixture(t)
  store.arm(1000)
  const winner = tokenHash(store.issue(null, 1000))
  const result = store.claim(winner, 1100)
  const restored = createRewardStore(db)
  assert.equal(restored.snapshot(1200).slug, store.snapshot(1200).slug)
  assert.equal(restored.claim(winner, 1300).expires_at, result.expires_at)
  assert.equal(restored.claim('wrong', 1300).phrase, undefined)
  const stored = db.prepare('SELECT * FROM reward_tokens').all()
  assert.equal(stored[0].hash, winner)
  assert.equal(JSON.stringify(stored).includes(FAKE_PHRASE), false)
})
