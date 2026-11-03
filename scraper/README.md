# SteamDB scraper prototype

This is the standalone data collector for the future Steam widget. It does not
change the live website, accounts, or scavenger hunt. The widget UI and its saved
game API are a separate project.

## Current live verification result

The first browser navigation from this PC to `https://steamdb.info/charts/`
returned **HTTP 403: "You have been banned on SteamDB"**. No further live visits
were made. The local worker was initialized in a persistent paused state. It has
**no live cached games**. The worker, cache API, and CDP extraction have been
tested with isolated local fixtures; extraction against the current real
SteamDB DOM and its chart library remains unverified.

The prototype never solves verification challenges, disguises browser automation,
or switches identities to get around a block. A ban, verification page, or
HTTP 401/403/429 pauses all visits until an operator restores source access and
explicitly resumes. A plain timeout or malformed page backs off that job.

## Scope and architecture

- **Input:** the current top ten by concurrent players plus the distinct union
  of saved app IDs across owners. The prototype's CLI supplies subscriptions;
  the future authenticated widget backend will need to supply those selections.
- **Output:** cached JSON player counts, 24-hour/all-time peaks where available,
  and player-series points already loaded in the page's Highcharts objects.
  No screenshot is used as UI data. No additional chart ranges are clicked.
- **Scheduling:** one navigation at a time, at least five minutes after the prior
  attempt finishes. Ranking discovery also consumes a slot. Each job targets an
  hour between attempts, but the spacing wins when the queue is large. An
  initial ranking page plus ten individual game pages requires at least fifty
  minutes from the first visit to the last, excluding page load time. New games
  wait their turn. There is no entire-catalog crawl or browser search yet.
- **Persistence:** separate SQLite database in `data/steamdb-scraper/cache.sqlite`.
  WAL, transactional claims, a reserved job timeout, and persisted next-visit
  timestamps prevent restarts from bypassing the gap. Last good data survives
  failures. Unsubscribed games are removed unless another owner or the top ten
  still needs them. Local count observations retain thirty days by default.
- **Browser:** Playwright Core attaches to loopback CDP, normally port 9222. If
  absent, the worker can start the installed Chrome headlessly with its own
  `data/steamdb-scraper/chrome-profile` directory. It creates and closes its own
  tab for each job and disconnects afterward. It does not enumerate or use
  existing personal tabs. Use a CDP instance reserved for this worker.
- **Interface:** read-only JSON API bound to `127.0.0.1:4175`. It cannot initiate
  visits or change subscriptions. Do not publish this port through nginx or
  Cloudflare; the future site's backend should consume it locally.

Two approaches were considered: putting browser automation into the existing
site API, or running an independent worker. The separate worker was chosen so
Chrome failures, dependencies, and scheduling cannot disrupt the live API. It
adds a separate process and startup configuration, and saved-game integration
still needs to be connected by the widget project.

## Files

| File | Responsibility |
| --- | --- |
| `config.js` | Loopback configuration and minimum spacing |
| `store.js` | SQLite schema, subscriptions, cache, fair queue and persistent claims |
| `extract.js` | Public page/chart extraction and result validation |
| `browser.js` | Dedicated Chrome startup, CDP connection and bounded visits |
| `worker.js` | One job at a time and success/failure recording |
| `http.js` | Read-only local cache/status API |
| `index.js` | Process lifecycle and scheduler loop |
| `cli.js` | Local operator commands |
| `tests/worker.test.js` | Scheduling, restart, cache, validation and API integration |
| `tests/browser.test.js` | Actual Chrome/CDP with intercepted local fixtures |

## Run and configure

Requires Node 24+ and an installed Chrome. The prototype has an isolated package
and lockfile; installing it does not add dependencies to the site's package.

```powershell
npm ci --prefix scraper
# Optional: copy scraper/.env.example to scraper/.env and edit it.
npm start --prefix scraper
```

`scraper/.env` is optional and ignored by Git. The worker does not load the site's
root `.env`, production session secrets, or production database. Settings:

| Variable | Default |
| --- | --- |
| `STEAMDB_PORT` | `4175` (loopback only) |
| `STEAMDB_CDP_URL` | `http://127.0.0.1:9222` |
| `STEAMDB_CHROME_PATH` | `C:/Program Files/Google/Chrome/Application/chrome.exe` |
| `STEAMDB_LAUNCH_CHROME` | `1`; use `0` for externally managed Chrome |
| `STEAMDB_HEADLESS` | `1` |
| `STEAMDB_DATA_DIR` | repo `data/steamdb-scraper` |
| `STEAMDB_GAP_SECONDS` | `300`; values below 300 are rejected |
| `STEAMDB_REFRESH_SECONDS` | `3600`; best-effort per job, not a freshness guarantee |
| `STEAMDB_RETENTION_DAYS` | `30` for locally observed samples |

Do not run a second foreground worker while the startup task/service is active.
The normal second instance fails to bind the local port. The scheduler also
reserves visits transactionally in SQLite to protect against overlapping claims.

## Operator commands

Run CLI commands from the `scraper` directory so optional `.env` settings match
the worker. Owners are opaque identifiers for the future account integration;
they are not authenticated by this local CLI.

```powershell
Set-Location scraper
node --env-file-if-exists=.env cli.js status
node --env-file-if-exists=.env cli.js watch owner 730
node --env-file-if-exists=.env cli.js watch another-owner 570
node --env-file-if-exists=.env cli.js list
node --env-file-if-exists=.env cli.js unwatch owner 730
node --env-file-if-exists=.env cli.js pause
```

Resume **only after source access is restored**:

```powershell
node --env-file-if-exists=.env cli.js resume --source-access-restored
```

Resume does not override the existing gap or a failed job's backoff. Do not
delete the database or rotate profiles as a way to retry earlier.

## Read-only API

| Endpoint | Response |
| --- | --- |
| `GET /health` | Process status, persistent pause reason, job timing, last error/success and cache counts |
| `GET /top?limit=3` | Most recent top-three snapshot; limit supports 1–10 |
| `GET /games/730` | Cached game summary, available scraped series and local observations |

`/health` returns 200 when the worker is reachable even if scraping is paused.
`status` is `warming_up`, `running`, or `paused`. `/top` and tracked games return
503 before their first successful fetch, not invented zero-player counts.
Unknown/untracked games return 404. Invalid IDs return 400; writes return 405.
All cache reads stay local and never trigger SteamDB requests.

Responses include `fetchedAt` and `stale`. Individual game responses separately
include `chartFetchedAt`, `historyStale`, and `historyStatus`. A ranking refresh
can update counts without refreshing that game's chart. Missing chart data is
reported as `unavailable` or `not_fetched`; it is not manufactured. If previously
retrieved chart data exists, a later missing chart preserves it as `stale` with
its original fetch time. Locally
observed counts are explicitly labeled `observations.source = local_samples`
and must not be presented as SteamDB's historical series. Game names and numbers
are untrusted external content; the future UI must render them as text.

## Windows startup and rollout

The prototype is installed as the **user-level scheduled task**
`aarg-steamdb-scraper`. It starts at Windows login, runs hidden, and retries an
unexpected exit up to three times at one-minute intervals. It does **not** run
before Windows login. Logs are `logs/steamdb-scraper.log` and
`logs/steamdb-scraper-error.log`; the user task preserves one previous run.

For a fresh user-level installation, from the repo root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-scraper-task.ps1
```

An NSSM service installer is also provided for an administrator who needs startup
before login. Do not install it alongside the scheduled task. Stop and remove
the user task, verify its worker has stopped, then run from an elevated shell:

```powershell
.\scripts\install-scraper-service.ps1
```

That service runs under NSSM's default service identity. Choose a separate
profile/data directory if changing Windows identities: an existing interactive
Chrome profile must not be concurrently opened by the service. The service
installation path is provided but has not been exercised in this non-elevated
session. It uses the existing NSSM binary; no live site service is restarted.

For updates: pause the worker, stop the task/service, take a consistent backup
of the scraper database if needed, install the locked dependencies, run tests,
and start the worker. The schema is additive `CREATE TABLE IF NOT EXISTS`; no
site database migration, API key, or new public port is required. Resolve the
SteamDB block before resuming visits. Verify `/health`, then one successful
ranking fetch, then individual game/chart data at the paced interval.

To roll back this prototype, stop and unregister its task (or stop/remove its
NSSM service), retaining the scraper data directory. This does not roll back or
touch the site's users or scavenger-hunt state. An automatically started Chrome
can outlive a worker crash; close only the dedicated scraper Chrome instance if
removing the worker. Never kill all Chrome processes.

Watch `paused`, `lastError`, `lastSuccessAt`, stale ages, cache counts and logs.
Persistent 403/challenge responses mean live extraction is blocked. Repeated
`rankings_not_found`/`game_data_not_found` means the page structure may differ
from the extractor. Increasing age with a growing queue is expected at the
five-minute limit; unbounded growth or repeated failures is not.

## Verification

```powershell
npm test --prefix scraper
npm run lint
```

The browser test launches a separate temporary Chrome profile and ephemeral CDP
port. Every page is fulfilled with synthetic fixtures; all other requests are
blocked. It does not use the production CDP listener, real SteamDB, or live
database. Set `STEAMDB_TEST_CHROME_PATH` if the test browser is elsewhere.

The tests cover simultaneous claims, crash/restart spacing, multiple owners and
deduplication, pruning, more games than fit in an hour, preservation of good data
on failure, persistent pause, transient backoff, invalid/partial page rejection,
zero-player results, cold/stale cache API responses, and real CDP extraction.
Live site compatibility is an explicit outstanding verification item, blocked
by SteamDB's response described above.
