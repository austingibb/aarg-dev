# aarg.dev

Personal website for [aarg.dev](https://aarg.dev). A minimal landing page with links to projects and services.

## Stack

- React 19 + Vite
- Tailwind CSS v4
- React Router v7
- Backend: bare `node:http` + built-in `node:sqlite` (zero npm deps)

## Features

- **Clip** — a cl1p.net-style paste utility at `/clip/<path>`, `/c/<path>`, or the
  short root form `/<path>` (named site pages take precedence): whitelisted logged-in
  users create a clip (custom path or generated short code), text stored locally with a
  1-day TTL, viewable from any computer (after login) with a copy button. A clip can
  carry one file attachment (max 5 MB, stored in SQLite, downloadable from the clip
  page, deleted with the clip). Both read and write require a whitelisted login.
- **User login** — email + password self-serve signup. The whitelist (managed by admin)
  gates the clip feature; the amber `clip` menu item appears only for whitelisted users.
- **Admin portal** — admin logs in with a PSK + TOTP code, then manages the whitelist
  and live clips. Admin login is hidden: press `Esc` on the home page, type
  `.\admin-login.sh`, then enter the PSK + 6-digit TOTP code. Red `admin` console menu
  items appear only when admin-logged-in.

## Dev

```bash
npm install
npm run dev
```

The frontend dev server proxies `/api` to `http://127.0.0.1:4174`. Run the backend in a
second shell:

```bash
npm run api
```

### Secrets / TOTP enrollment (first run)

Generate the three required secrets (`SESSION_SECRET`, `TOTP_SECRET`, `ADMIN_PSK_HASH`)
and enroll the TOTP in Google Authenticator:

```bash
node scripts/generate-secrets.js
```

This prompts for an admin PSK, writes `.env` (without clobbering existing keys; `--force`
to overwrite), and prints the base32 secret + `otpauth://` URI for Google Authenticator
("Enter a setup key", account `admin`, time-based). Verify your phone code matches:

```bash
node scripts/generate-secrets.js --code
```

Set or rotate just the admin PSK (leaves `SESSION_SECRET`/`TOTP_SECRET` untouched — use
this after the initial run to set your own PSK without re-enrolling TOTP):

```bash
node scripts/generate-secrets.js --psk
```

`.env` (gitignored) holds `API_PORT`, `SESSION_SECRET`, `TOTP_SECRET`, `ADMIN_PSK_HASH`.
Set `CLIP_TTL_SECONDS` to override the 24h clip lifetime (handy for testing).

## Build

```bash
npm run build
```

## Deployment

Two NSSM Windows services run on the owner's machine, behind a Cloudflare tunnel:

1. **`aarg-dev`** — nginx serving the static `dist/` (SPA fallback) + proxying `/api/` to
   the backend on `127.0.0.1:4174`.
2. **`aarg-dev-api`** — the Node API (`node --env-file=.env server/index.js`).

Cloudflare terminates TLS; the tunnel forwards `aarg.dev` to nginx on `localhost:4173`,
which proxies `/api/` to the backend.

Install / reinstall the nginx service (builds `dist/`, validates the config, registers
nginx) — **run from an elevated PowerShell**:

```powershell
.\scripts\install-service.ps1
```

Install the API service (checks node + `.env` + `data/`/`logs/`, registers the node
process, smoke-tests `/api/auth/me`):

```powershell
.\scripts\install-api-service.ps1
```

Remove either:

```powershell
.\scripts\uninstall-service.ps1
.\scripts\uninstall-api-service.ps1
```

After a content change, rebuild and restart both services:

```powershell
npm run build
Restart-Service aarg-dev
Restart-Service aarg-dev-api
```

- `nginx.conf` — nginx config (uses the shared `C:\nginx` binary, includes the `/api/` proxy).
- `server/` — the Node backend (`index.js` router, `handlers.js` endpoints, `auth.js`
  sessions + rate limiting, `totp.js` RFC 6238, `db.js` sqlite).
- `scripts/install-service.ps1` — builds and registers nginx as the `aarg-dev` service.
- `scripts/install-api-service.ps1` — registers the node API as the `aarg-dev-api` service.
- `scripts/generate-secrets.js` — generates secrets + enrolls TOTP.
