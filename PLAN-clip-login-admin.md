# Clip utility + user login + admin portal (TOTP) for aarg.dev

## Context

aarg.dev is a terminal-styled personal site: a static Vite + React 19 SPA (react-router v7), served by nginx (`nginx.conf`, port 4173, root `dist/`, SPA fallback) running as NSSM Windows service `aarg-dev` on the owner's machine, behind a Cloudflare tunnel. There is **no backend today** — this work adds the first one.

Three features:
1. **Clip** — a cl1p.net-style paste utility at `aarg.dev/clip/<path>`: whitelisted logged-in users create a clip (custom path or generated 3-char short code, 4 chars on congestion), text stored locally on this machine with a 1-day TTL, viewable from any computer (after login) with a copy button. **Both read and write require a whitelisted login** (user's choice).
2. **User login** — email + password self-serve signup. The whitelist (managed by admin) gates the clip feature; the `clip` menu item only appears (amber/yellow) for logged-in whitelisted users.
3. **Admin portal** — admin logs in with a PSK + TOTP code (secrets in a new `.env`; the TOTP counterpart is enrolled in Google Authenticator on the owner's phone). Admin manages the whitelist (and live clips). Admin menu items render **red** on the home list, only when admin is logged in.

Decisions already made: bare `node:http` + built-in `node:sqlite` (Node v24.16.0 installed — zero new npm dependencies), backend on `127.0.0.1:4174` behind an nginx `/api/` proxy, stateless HMAC-signed session cookie.

## 1. Backend — new `server/` directory (zero npm deps)

### `server/index.js` — HTTP server + router
- `node:http` on `process.env.API_PORT || 4174`, host `127.0.0.1`.
- Tiny router: `{method, regex-with-named-groups, handler, auth}` table; JSON responses; 404/405 fallbacks.
- Helpers: `readJsonBody(req, maxBytes=256KB)` (413 over limit; 415 unless `Content-Type: application/json` on state-changing routes — CSRF backstop), `send(res, status, obj)`, `getClientIp(req)` (prefer `CF-Connecting-IP`, then `X-Real-IP`, then socket).
- Auth levels: `public`, `user` (valid session), `whitelisted` (user + email in whitelist table), `admin` (session admin flag).
- Hourly `setInterval` purge of expired clips + lazy purge in clip handlers.
- Startup fails fast with clear message if `SESSION_SECRET` / `TOTP_SECRET` / `ADMIN_PSK_HASH` missing (points to `scripts/generate-secrets.js`).

### `server/db.js` — `node:sqlite` `DatabaseSync` on `data/aarg.db`
`PRAGMA journal_mode=WAL`; create `data/` if missing. Schema (`CREATE TABLE IF NOT EXISTS`):
```sql
users     (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
           pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
whitelist (email TEXT PRIMARY KEY COLLATE NOCASE, added_at INTEGER NOT NULL);
clips     (path TEXT PRIMARY KEY, content TEXT NOT NULL, created_by TEXT NOT NULL,
           created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
```
Prepared-statement wrappers: `createUser`, `getUserByEmail`, `isWhitelisted`, `addWhitelist`, `removeWhitelist`, `listWhitelist`, `insertClip`, `getLiveClip(path, now)`, `listLiveClips`, `deleteClip`, `purgeExpired(now)`.

### `server/auth.js` — passwords, sessions, rate limiting
- **Passwords:** `crypto.scryptSync` (N=16384, r=8, p=1, random 16-byte salt), stored as `scrypt$16384$8$1$<saltB64>$<hashB64>`; verify with `crypto.timingSafeEqual`.
- **Session cookie `aarg_sess`:** `base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload, SESSION_SECRET))`. Payload `{e: email|null, a: 0|1, iat, exp}`. User exp 7 days; admin-flagged sessions capped at 12h. Flags: `HttpOnly; Secure; SameSite=Lax; Path=/`. Whitelist/admin capability re-checked against DB/.env per request, so revocation is instant despite stateless cookies.
- **In-memory rate limiter** (single process): user login 10/15min/IP and 5/15min/IP+email; signup 5/h/IP; admin login 5/h/IP → 429.

### `server/totp.js` — RFC 6238, hand-rolled (~60 lines)
- `base32Decode` (RFC 4648), HMAC-SHA1 + dynamic truncation → 6 digits.
- `verifyTotp(secret, code, now)`: ±1 time-step window, `timingSafeEqual` compare, module-level last-accepted-counter replay guard.

### `server/handlers.js` — API endpoints

| Method | Path | Auth | Behavior |
|---|---|---|---|
| POST | `/api/auth/signup` | public | `{email, password}`; email regex, password ≥ 8; 409 if taken; sets cookie |
| POST | `/api/auth/login` | public | scrypt verify; dummy scrypt on unknown email (no enumeration); generic error; sets cookie preserving admin flag |
| POST | `/api/auth/logout` | public | clears cookie |
| GET | `/api/auth/me` | public | `{email, whitelisted, admin}` or `{email: null}` — frontend bootstrap |
| POST | `/api/admin/login` | public | `{psk, totp}`; verify PSK against `ADMIN_PSK_HASH` AND TOTP unconditionally (uniform timing); sets `a:1`, keeps user email, 12h exp |
| POST | `/api/admin/logout` | admin | drops admin flag, keeps user session if present |
| GET | `/api/admin/whitelist` | admin | `[{email, added_at}]` |
| POST | `/api/admin/whitelist` | admin | `{email}` add (idempotent) |
| DELETE | `/api/admin/whitelist/:email` | admin | remove |
| GET | `/api/admin/clips` | admin | live clips metadata (no content) |
| DELETE | `/api/admin/clips/:path` | admin | delete clip |
| GET | `/api/clip/:path` | whitelisted | `{path, content, expires_at}`; 401 not logged in / 403 not whitelisted / 404 missing-or-expired |
| POST | `/api/clip` | whitelisted | `{path?, content}` → create; returns `{path, url, expires_at}` |

**Clip logic:**
- Custom path: `^[a-z0-9][a-z0-9_-]{0,63}$` (lowercase). Live clip at path → 409; expired row → delete and proceed.
- Generated path: 5 attempts of 3 chars `[a-z0-9]` via `crypto.randomInt`; on 5 collisions, 5 attempts of 4 chars; then 507.
- `expires_at = now + (CLIP_TTL_SECONDS || 86400)`; content cap 200 KB; purge lazily + hourly.

### `scripts/generate-secrets.js` — secrets + TOTP enrollment (owner runs interactively)
- Generates `SESSION_SECRET` (32 bytes hex) + `TOTP_SECRET` (20 bytes → base32); prompts for admin PSK via `node:readline` and stores only its scrypt hash as `ADMIN_PSK_HASH`.
- Writes/updates `.env` at repo root without clobbering existing keys (`--force` to overwrite).
- Prints base32 secret + `otpauth://totp/aarg.dev:admin?secret=<b32>&issuer=aarg.dev&algorithm=SHA1&digits=6&period=30` for Google Authenticator "Enter a setup key".
- `--code` mode prints the current expected 6-digit code (verify phone matches; also used in curl tests).

### `.env` (repo root, gitignored, loaded via `node --env-file=.env`)
```
API_PORT=4174
SESSION_SECRET=<64 hex>
TOTP_SECRET=<base32>
ADMIN_PSK_HASH=scrypt$16384$8$1$...$...
```

## 2. Infrastructure changes

- **`.gitignore`**: add `.env*` and `data/` (do this FIRST, before any secret exists).
- **`nginx.conf`**: add before the SPA fallback location:
  ```nginx
  location /api/ {
      proxy_pass http://127.0.0.1:4174;   # no trailing path — URI forwarded unchanged
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      client_max_body_size 1m;
  }
  ```
- **`scripts/install-api-service.ps1`** (+ `uninstall-api-service.ps1`): mirror `scripts/install-service.ps1`. NSSM service `aarg-dev-api`; AppPath = node.exe, AppParameters `--env-file=.env server/index.js`, AppDirectory = repo root; preflight: node on PATH, `.env` exists (abort with generate-secrets instruction), create `data/` + `logs/`; same log/restart settings; smoke-test `http://127.0.0.1:4174/api/auth/me` after start.
- **`vite.config.js`**: `server.proxy = { '/api': 'http://127.0.0.1:4174' }` (dev cookies stay same-origin).
- **`package.json`**: add script `"api": "node --env-file=.env server/index.js"`. No new dependencies.
- **`README.md`**: backend overview, secrets/TOTP enrollment, dev workflow, second-service install, deploy checklist (`npm run build; Restart-Service aarg-dev; Restart-Service aarg-dev-api`).

## 3. Frontend — shared plumbing

- **`src/api.js`** (new): fetch wrapper `api(method, path, body?)` throwing `{status, error}` on non-2xx; exports typed helpers for every endpoint.
- **`src/auth.js` + `src/AuthProvider.jsx`** (new; mirrors the `metrics.js`/`MetricsProvider.jsx` split): `useAuth()` → `{user: {email, whitelisted, admin} | null, loading, refresh()}`; fetches `/api/auth/me` on mount; mounted above `<Routes>` in `main.jsx`.
- **`src/terminal.jsx`** (append — first real inputs; safe because `useRovingMenu` ignores INPUT/TEXTAREA at `useRovingMenu.js:23`):
  - `Field({label, type, value, onChange, placeholder, autoFocus, onEnter})` — `<input className="tui-input">`
  - `TextArea({label, value, onChange, rows, placeholder})` — `tui-input tui-textarea`
  - `Button({children, onClick, variant})` — `tui-btn`, `danger` variant for red admin actions
  - `Notice({kind: 'error'|'ok'|'info', children})` — one-line status (red/green/dim)
- **`src/index.css`** (append): `.tui-input` (bordered, amber focus glow), `.tui-textarea`, `.tui-btn` + `.tui-btn.danger`, and the red admin row variant:
  ```css
  .tui-row.is-admin .caret { color: var(--red); }
  .tui-row.is-admin.is-sel { background: rgba(224,115,108,.13); border-left-color: var(--red); }
  .tui-row.is-admin.is-sel .caret, .tui-row.is-admin.is-sel .arrow { color: var(--red); }
  ```
- **`src/useRovingMenu.js`**: add clamp effect (`if (selected >= count) setSelected(max(0, count-1))`) — menu length now changes with auth state.

## 4. Frontend — views & routes

- **`src/main.jsx`**: wrap Routes in `<AuthProvider>`; add routes `/login` → Login, `/clip` → Clip, `/clip/:path` → ClipView, `/admin` → Admin.
- **`src/Login.jsx`**: Screen→Window→Prompt layout cloned from `Blog.jsx`; login ↔ signup toggle; email + password `Field`s; errors in `Notice`; honors `?next=` (redirect after `refresh()`); `../ home` back row.
- **`src/Clip.jsx`** (create): guards — not logged in → redirect `/login?next=/clip`; not whitelisted → red notice. Custom-path `Field` (blank = generate short url), content `TextArea`, create `Button`; on success show `/clip/<path>` link + copy-URL button + expiry; 409/validation errors in red.
- **`src/ClipView.jsx`** (read): fetch on mount; 401 → `/login?next=/clip/<path>`; 403 → not-whitelisted notice; 404 → "no such clip (or it expired)". Content in read-only `<pre>` styled like `tui-input`; header with path + expires-in; `copy` button via `navigator.clipboard.writeText` with "copied!" feedback.
- **`src/Admin.jsx`**: unlisted route (typed directly). Not admin → PSK + 6-digit TOTP form. Admin → red-accented sections rendered from an extensible `sections` array: **whitelist** (list with red remove buttons + add field) and **clips** (live clips table with red delete), plus admin-logout (danger). Window tag `root`.
- **`src/App.jsx`** — dynamic menu:
  ```js
  const links = [
    ...LINKS,
    ...(user?.whitelisted ? [{ label: 'clip', hint: 'ephemeral text drop', to: '/clip' }] : []),
    ...(user?.email ? [{ label: 'logout', hint: user.email, action: 'logout' }]
                    : [{ label: 'login',  hint: 'sign in / sign up', to: '/login' }]),
    ...(user?.admin ? [{ label: 'admin', hint: 'root console', to: '/admin', variant: 'admin' }] : []),
  ]
  ```
  `useRovingMenu(links.length)`; append `is-admin` to className when `variant === 'admin'`; support `action: 'logout'` rows (onClick → logout API + `refresh()`; keeps Enter-to-activate working since the hook calls `.click()`). Status bar gains `{user?.email ?? 'guest'}` (dim; red `root` suffix when admin).

## 5. Implementation order

1. `.gitignore` → `scripts/generate-secrets.js` (agent may generate a throwaway dev `.env` for testing; owner re-runs for real secrets)
2. Backend: `server/totp.js` → `auth.js` → `db.js` → `handlers.js` → `index.js`; `package.json` script
3. Infra: `nginx.conf`, `vite.config.js`, install/uninstall-api-service scripts
4. Frontend plumbing: `api.js`, `auth.js`/`AuthProvider.jsx`, terminal.jsx components, index.css, useRovingMenu clamp
5. Views: Login, Clip, ClipView, Admin; `main.jsx` routes; App.jsx dynamic links
6. README

## 6. Verification

**Dev run:** shell A `npm run api` (after dev `.env` exists), shell B `npm run dev` → `http://localhost:5173` with `/api` proxied.

**Backend smoke (curl with cookie jar):** `me` returns null → signup sets cookie → `me` shows email, `whitelisted:false` → admin login with PSK + `node scripts/generate-secrets.js --code` → whitelist the email → create clip (generated 3-char path) → GET clip. Negative cases: wrong password → 401 generic; rapid logins → 429; clip access without whitelist → 403; custom-path collision → 409; reused TOTP code → rejected.

**TTL:** set `CLIP_TTL_SECONDS=5` in dev, create clip, confirm 404 after ~6s.

**TOTP enrollment E2E:** run generator → Google Authenticator "Enter a setup key" (account `admin`, time-based) → compare phone code with `--code` output → log in at `/admin`.

**UI E2E:** logged out home shows no clip/login-state extras beyond `login` → signup → whitelist self via `/admin` → home shows amber `clip` row + red `admin` row → create custom + generated clips → open `/clip/<path>` from a second browser profile (login required) → copy button works → admin clips list + delete works → keyboard-only pass (arrows/jk/Enter over the grown menu; typing in fields doesn't move the menu).

**Prod:** `npm run build`; run `install-api-service.ps1` elevated; restart `aarg-dev` (nginx picked up proxy block); confirm `https://aarg.dev/api/auth/me` returns JSON through the tunnel.

## 7. Security notes

- `timingSafeEqual` for all secret compares; dummy scrypt on unknown email; PSK and TOTP both always evaluated.
- Rate limits keyed on `CF-Connecting-IP` (trustworthy: origin is loopback-only behind the tunnel).
- Cookies `HttpOnly; Secure; SameSite=Lax`; 12h admin lifetime; CSRF backstop = SameSite + mandatory JSON content-type on writes.
- PSK stored only as scrypt hash; `.env*` gitignored before any secret is written; generator never clobbers existing keys.
- TOTP ±1 step window + replay guard on last accepted counter.
- Caps: 256 KB JSON body, 200 KB clip content, path/email regex, password ≥ 8.
- Stateless-cookie caveat (accepted): can't revoke individual sessions early; whitelist/admin re-checked per request from DB/.env; rotate `SESSION_SECRET` for global logout.
