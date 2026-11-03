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
  selectable lifetime (5 min through 1 year, or forever; default 1 day), viewable from any computer (after login) with a copy button. A clip can
  carry one file attachment (max 5 MB, stored in SQLite, downloadable from the clip
  page, deleted with the clip). Both read and write require a whitelisted login.
- **Short links** — public URL creation at `/short`, with generated 4-character
  or custom paths and the same selectable lifetimes as clips, 5 min through forever (plus
  single-use). `/<path>` checks short links before clips; `/s/<path>` is the
  unambiguous form. Creation permanently disables itself after 20 creations in
  a rolling 24-hour window until the database setting is reviewed and reset;
  reads remain available.

After investigating a creation shutdown, re-enable it explicitly with SQLite:

```sql
UPDATE app_settings SET value = '0' WHERE key = 'short_link_creation_disabled';
DELETE FROM short_link_creations;
```
- **User login** — email + password self-serve signup. The whitelist (managed by admin)
  gates the clip feature; the amber `clip` menu item appears only for whitelisted users.
- **Admin portal** — admin logs in with a PSK + TOTP code, then manages the whitelist
  and live clips. Admin login is hidden: press `Esc` on the home page, type
  `.\admin-login.sh`, then enter the PSK + 6-digit TOTP code. Red `admin` console menu
  items appear only when admin-logged-in.

## Widgets

Site features share `src/widgets/Widget.jsx`, with page and inline presentations.
`src/widgets/registry.js` defines stable widget type IDs, navigation visibility,
route aliases, layout defaults, and telemetry groups. `WidgetRoutes.jsx` binds
routed types to React components. Shell blocks and individual telemetry charts
are inline widgets; inputs, prompts, and charts remain reusable UI primitives.
The private scavenger-hunt flow stays outside the registry and is resolved by
the existing dynamic URL handler. Navigation visibility is not authorization;
the existing page and API access checks still apply.

A widget type and a configured instance are separate. `createWidgetInstance`
returns serializable `{ id, widgetId, config }` data with a unique instance ID.
Render repeated instances with `<Widget key={pin.id} instance={pin}>`, and read
their configuration inside child components with `useWidgetInstance()`.
Existing single-instance features can use `<Widget id="blog">` directly.

For the planned Steam player-count widget, register one type and create a
separate instance configured with an app ID for each pinned game. The future
account dashboard/API will own pin persistence and ownership; this refactor
adds the instance foundation, not Steam fetching or saved per-user dashboards.

Check registry visibility, route aliases, and instance isolation with
`npm run test:widgets`. `tests/widgets-browser.mjs` checks the built UI using
the same `PLAYWRIGHT_MODULE` / `CHROMIUM_PATH` setup as the reward browser test;
run `npm run build:check` first. It serves only `dist-check`, mocks API calls,
and blocks external requests.

## Dev

The standalone SteamDB scraper prototype lives in [`scraper/`](scraper/README.md).
It has separate dependencies, a local cache API, and Windows startup scripts.
See its README for the current live-source blocker and prototype limitations.

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
Set `CLIP_TTL_SECONDS` to override the default 1-day clip lifetime (handy for testing).

## Build

### Curiosity reward (alpha)

The reward is a **simulation only**: it contains a deliberately invalid test
phrase, no cryptocurrency, and no real credential input/storage. Real DOGE
wallet provisioning is deferred to v1.0. Hosting migration is deferred to v2.0.

The existing admin console has a **reward** tab with the stable physical URL,
current state, and **Arm reward**. A cryptographically random URL is generated
once when the new backend first initializes its database; it is not published
in client code or listed in the public shortener. The password verifier is
server-side. The owner-only `SCAVENGER_HUNT.md` is ignored by Git and is not a
build asset. Keep that document privately alongside the deployment handoff.

While armed, the space-themed entrance requires signup/login through the existing
site account flow before it accepts the battery password. Any existing account
with an active login qualifies; no whitelist or new email-verification step is
required. Admin-only sessions are not user accounts. Signup returns visitors to
the entrance. Password entry issues an account-bound HttpOnly browser cookie.
The first successful Claim atomically reserves the reward for that account and
token. Both are required to retrieve the placeholder during the original hour.
Logout, switching accounts or deleting the account prevents retrieval.

When reserved, closed or initially disarmed, guests still see the space entrance
and must enter the password to see the carnival consolation. A view-only cookie
cannot claim a reward, even if an admin later arms it. This preserves the surprise
without promising an available reward after someone has claimed it.

Acknowledgment ends access early. Neither timeout nor acknowledgment allows a
second winner or rearming. Unclaimed eligibility cookies permit claiming for
24 hours; the winning reservation has its own fixed one-hour deadline. Clearing
cookies loses access. Account binding adds nullable user IDs and token purposes
to the reward tables; legacy anonymous eligibility tokens cannot claim. An
active legacy recovery window blocks migration until its deadline has passed.

Reward tables are additive to the existing SQLite database. No npm dependencies
or external wallet APIs are added. The API remains single-process Node behind
nginx/Cloudflare. Reward POSTs require an exact Origin match:

- `REWARD_ORIGIN`: defaults to `https://aarg.dev`; set the exact dev frontend origin locally.
- `REWARD_PASSWORD_HASH`: required server-only salted scrypt verifier, using the
  same format as admin passwords. Set it in ignored `.env`; never prefix it with
  `VITE_`. Neither the printed word nor its real verifier belongs in source or
  tests. Tests generate their own random password and verifier on every run.
- `AARG_DATA_DIR`: optional isolated SQLite directory; defaults to `data/`.
- `API_PORT`: defaults to `4174`; `0` allocates an ephemeral port for tests.
- `AARG_API_TARGET`: optional Vite proxy target; defaults to the existing API.

Production builds explicitly use Vite's Oxc minifier and disable source maps.
This is lightweight code mangling, not an authorization control. Access checks
remain on the backend. The physical URL, password verifier, and claim database
remain private regardless of the repository's visibility.

**Do not run `npm run build` during development verification:** `dist/` is served
live by nginx on this machine. Use `npm run build:check` to write `dist-check/`.
`npm run test:reward` uses temporary databases, fake session credentials, and
ephemeral API ports. It never reads `.env` or connects to the production API.

`node tests/reward-browser.mjs` runs the isolated Chromium flow and saves screenshots
under `.reward-test.local/`. Set `PLAYWRIGHT_MODULE` to an installed Playwright
module file URL and `CHROMIUM_PATH` to its installed browser executable first.
The harness uses port 5188 (strict), blocks external browser requests, generates
fake admin credentials, and cleans up its temporary database and servers.

For a manually exercised isolated alpha, open a backend PowerShell:

```powershell
$env:AARG_DATA_DIR = Join-Path $env:TEMP ('aarg-alpha-' + [guid]::NewGuid())
$env:API_PORT = '4184'
$env:REWARD_ORIGIN = 'http://localhost:5180'
npm run api
```

This uses the existing local `.env` for your admin login, but the separate data
directory protects production state. In a second PowerShell:

```powershell
$env:AARG_API_TARGET = 'http://127.0.0.1:4184'
npm run dev -- --port 5180 --strictPort
```

Use `localhost` in the browser so the Secure cookie can work on a local secure
context. Confirm cookie acceptance during browser testing. A fresh isolated
data directory gives a fresh alpha campaign for repeated tests; normal arming
never resets a claimed campaign. Do not delete or restore production state to
repeat a test.

Rollout, after Test approval: take a consistent SQLite backup, start the updated
API (which adds the reward tables), publish the reviewed frontend build, then
open admin and arm deliberately. Merely deploying leaves the reward disarmed.
For rollback, restore the prior application build while retaining the current
database. Never roll the database back to an unclaimed snapshot after a claim.
Monitor reward 5xx/429 responses and status transitions; never log credentials,
cookies, or response bodies. No automatic service restart or live deployment
is performed by the development commands above.

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
