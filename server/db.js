/* SQLite persistence for aarg.dev (users, whitelist, clips).
 * Uses the built-in node:sqlite DatabaseSync (Node v24+) — zero npm deps.
 * WAL mode for safe concurrent reads from nginx + the hourly purge.
 */
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DATA_DIR = resolve(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })

export const db = new DatabaseSync(resolve(DATA_DIR, 'aarg.db'))
db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS whitelist (
  email     TEXT PRIMARY KEY COLLATE NOCASE,
  added_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS clips (
  path       TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
`)

/* ---- prepared-statement wrappers ---- */
export const stmt = {
  createUser:     db.prepare('INSERT INTO users (email, pass_hash, created_at) VALUES (?, ?, ?)'),
  getUserByEmail: db.prepare('SELECT id, email, pass_hash, created_at FROM users WHERE email = ?'),
  isWhitelisted:  db.prepare('SELECT 1 FROM whitelist WHERE email = ?'),
  addWhitelist:   db.prepare('INSERT OR IGNORE INTO whitelist (email, added_at) VALUES (?, ?)'),
  removeWhitelist:db.prepare('DELETE FROM whitelist WHERE email = ?'),
  listWhitelist:  db.prepare('SELECT email, added_at FROM whitelist ORDER BY added_at ASC'),
  insertClip:     db.prepare('INSERT INTO clips (path, content, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)'),
  getLiveClip:    db.prepare('SELECT path, content, created_by, created_at, expires_at FROM clips WHERE path = ? AND expires_at > ?'),
  listLiveClips:  db.prepare('SELECT path, created_by, created_at, expires_at FROM clips WHERE expires_at > ? ORDER BY created_at DESC'),
  deleteClip:     db.prepare('DELETE FROM clips WHERE path = ?'),
  purgeExpired:   db.prepare('DELETE FROM clips WHERE expires_at <= ?'),
  clipExists:     db.prepare('SELECT 1 FROM clips WHERE path = ?'),
}
