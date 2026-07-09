#!/usr/bin/env node
/*
 * Publishes the S&P 500 as 6 twelve-hour averages over the last 3 days.
 *
 * Index intraday data has no keyless, CORS-enabled source, so the browser
 * can't fetch it directly. Instead run this server-side (no CORS there) on
 * a schedule — a Pi5 cron or an AWS Lambda every ~15 min — upload the
 * output to a public, CORS-enabled URL, and set MARKET_URL in
 * src/metrics.js to that URL. Same publish-a-cached-blob pattern as the
 * caffeine feed.
 *
 *   node scripts/publish-market.mjs > market.json
 *   aws s3 cp market.json s3://<bucket>/market.json \
 *     --content-type application/json --cache-control "max-age=60"
 *
 * The bucket needs public-read on the object plus a CORS policy allowing
 * GET from https://aarg.dev (or *). Requires Node 18+ (global fetch).
 */

const SYMBOL = '%5EGSPC' // ^GSPC — the S&P 500 index
const SRC = `https://query1.finance.yahoo.com/v8/finance/chart/${SYMBOL}?range=5d&interval=1h`

const BUCKET_H = 12
const BUCKETS = 6
const H = 3.6e6

const res = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0' } })
if (!res.ok) {
  console.error('yahoo fetch failed:', res.status)
  process.exit(1)
}

const r = (await res.json()).chart.result[0]
const points = r.timestamp
  .map((t, i) => ({ t: t * 1000, c: r.indicators.quote[0].close[i] }))
  .filter((p) => p.c != null)

if (points.length === 0) {
  console.error('no price points returned')
  process.exit(1)
}

// oldest -> newest: average the closes in each 12h window, forward-filling
// windows that fall on a market close (nights / weekends).
const now = Date.now()
const sp500 = []
let carry = points[0].c
for (let i = BUCKETS - 1; i >= 0; i--) {
  const hi = now - i * BUCKET_H * H
  const lo = hi - BUCKET_H * H
  const inBucket = points.filter((p) => p.t > lo && p.t <= hi)
  if (inBucket.length) {
    carry = inBucket.reduce((a, p) => a + p.c, 0) / inBucket.length
  }
  sp500.push(Number(carry.toFixed(2)))
}

process.stdout.write(JSON.stringify({ sp500, updated: now }) + '\n')
