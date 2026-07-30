/* SQLite persistence for aarg.dev (users, whitelist, clips, short links).
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
CREATE TABLE IF NOT EXISTS clip_files (
  clip_path  TEXT PRIMARY KEY REFERENCES clips(path) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  data       BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS short_links (
  path       TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,
  single_use INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS short_link_creations (
  id         INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  ip         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS short_link_creations_created_at
  ON short_link_creations(created_at);
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
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
  insertClipFile: db.prepare('INSERT INTO clip_files (clip_path, name, mime, size, data) VALUES (?, ?, ?, ?, ?)'),
  getClipFileMeta:db.prepare('SELECT name, mime, size FROM clip_files WHERE clip_path = ?'),
  getClipFile:    db.prepare('SELECT name, mime, size, data FROM clip_files WHERE clip_path = ?'),
  insertShortLink: db.prepare('INSERT INTO short_links (path, target_url, created_at, expires_at, single_use) VALUES (?, ?, ?, ?, ?)'),
  getShortLink:    db.prepare('SELECT path, target_url, created_at, expires_at, single_use FROM short_links WHERE path = ?'),
  shortLinkExists: db.prepare('SELECT 1 FROM short_links WHERE path = ?'),
  deleteShortLink: db.prepare('DELETE FROM short_links WHERE path = ?'),
  purgeExpiredShortLinks: db.prepare('DELETE FROM short_links WHERE expires_at IS NOT NULL AND expires_at <= ?'),
  countRecentShortLinkCreations: db.prepare('SELECT count(*) AS count FROM short_link_creations WHERE created_at > ?'),
  recordShortLinkCreation: db.prepare('INSERT INTO short_link_creations (created_at, ip) VALUES (?, ?)'),
  purgeOldShortLinkCreations: db.prepare('DELETE FROM short_link_creations WHERE created_at <= ?'),
  getSetting:      db.prepare('SELECT value FROM app_settings WHERE key = ?'),
  setSetting:      db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
}
