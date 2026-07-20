---
name: verify
description: Build/launch/drive recipe for verifying aarg-dev changes in a real browser.
---

# Verifying aarg-dev

## Launch

```bash
npm run dev            # Vite; picks the next port if 5173 is busy — read the output
npm run api            # optional: metrics/clip API (node --env-file=.env server/index.js)
```

The SPA works without the API: metric sparklines render dot placeholders of the
same width, so layout checks are still valid.

## Drive (headless browser)

No Playwright in devDependencies. A cached copy works:

- module: `file:///C:/Users/austi/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs`
- browsers under `~/AppData/Local/ms-playwright/` may be older than that
  Playwright expects — pass `executablePath` (e.g.
  `.../chromium-1223/chrome-win64/chrome.exe`) to `chromium.launch` instead of
  running `npx playwright install`.

Write the script in the scratchpad, screenshot at several viewport widths
(320/360/390/430 for mobile, 1280 for desktop regression).

## Production is this machine

aarg.dev is served FROM this PC: nginx (NSSM service `aarg-dev`) serves the
static `dist/` behind a Cloudflare tunnel. The user often reports bugs against
the live site, so verifying on a dev server is not enough — a frontend fix
isn't visible to them until `npm run build` refreshes `dist/` (no service
restart needed for static files; restart `aarg-dev-api` only for server/
changes). Check staleness with:
`curl -s https://aarg.dev/ | grep -o '/assets/[^"]*\.js'` vs `ls dist/assets`.
Note: local nginx on port 5173 is an UNRELATED project (yt-2-eink-web) —
don't confuse it with the Vite dev server, which will silently pick 5174.

## Worth checking

- Layout containment: compare each element's `getBoundingClientRect().right`
  against `.tui-frame`'s, and `scrollWidth` vs `innerWidth` — the terminal
  frame must contain everything at phone widths.
- Wait ~1.5s after `networkidle` for the boot animation and metrics fetch.
