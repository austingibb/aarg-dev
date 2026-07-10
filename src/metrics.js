import { useState, useEffect, createContext, useContext } from 'react'

/* ==================================================================
 * Live metrics for the aarg.dev "system" panel.
 * Everything here is real data pulled straight from public APIs (or
 * computed on the client). No fake sparklines.
 * ================================================================== */

export const GH_USER = 'austingibb'

/* ------------------------------------------------------------------
 * CAFFEINE
 * Your desk agent logs each drink and (eventually) publishes a JSON
 * blob to AWS. Point STATUS_URL at it to go live. Expected shape:
 *
 *   {
 *     "active": true,                       // are you at the keyboard?
 *     "drinks": [ { "t": 1783600000000,     // epoch ms of the drink
 *                   "mg": 95 }, ... ]        // caffeine dose in mg
 *   }
 *
 * The blood-caffeine estimate (5.5 h elimination half-life + a short
 * absorption ramp) is computed here, in the browser, so the number
 * decays smoothly in real time between fetches. If the feed is
 * unreachable the caffeine metric shows "—" rather than faking a value.
 * ------------------------------------------------------------------ */
export const STATUS_URL = 'https://aarg-status.s3.us-west-2.amazonaws.com/caffeine.json'

const HALF_LIFE_H = 5.5    // caffeine elimination half-life (hours)
const ABSORB_H = 0.5       // ~30 min to fully absorb / peak

/** Estimated blood caffeine (mg) contributed by all drinks at time tMs. */
export function caffeineAt(drinks, tMs) {
  let total = 0
  for (const d of drinks) {
    const dt = (tMs - d.t) / 3.6e6 // hours since the drink
    if (dt < 0) continue
    const f = dt < ABSORB_H
      ? dt / ABSORB_H                                   // absorbing: ramp up
      : Math.pow(0.5, (dt - ABSORB_H) / HALF_LIFE_H)    // eliminating: decay
    total += d.mg * f
  }
  return total
}

/** Sample the caffeine curve as fixed hourly buckets + one live bar.
 *  The first n-1 points sit on top-of-the-hour marks — solidified, they
 *  never move once their hour completes. The final point is sampled at
 *  `now`, so the last bar rises/decays in real time (and always equals
 *  the displayed mg); when the hour rolls over it freezes into the next
 *  fixed mark and a new live bar begins. */
export function caffeineSeries(drinks, now, n = 14) {
  const H = 3.6e6 // one hour in ms
  const lastMark = Math.floor(now / H) * H
  const out = []
  for (let i = n - 2; i >= 0; i--) {
    out.push(caffeineAt(drinks, lastMark - i * H))
  }
  out.push(caffeineAt(drinks, now))
  return out
}

export async function fetchStatus() {
  if (!STATUS_URL) return null
  try {
    const r = await fetch(STATUS_URL, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    if (!Array.isArray(j.drinks)) return null
    return { drinks: j.drinks, active: typeof j.active === 'boolean' ? j.active : null }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------
 * COMMITS — real daily contribution counts for the last 7 days
 * (jogruber's contributions API includes private contributions).
 * Falls back to counting commits in public PushEvents.
 * ------------------------------------------------------------------ */
export async function fetchCommitDays() {
  try {
    const r = await fetch(`https://github-contributions-api.jogruber.de/v4/${GH_USER}?y=last`)
    if (r.ok) {
      const j = await r.json()
      const days = j.contributions.slice(-14).map((c) => c.count)
      if (days.length === 14) return days
    }
  } catch { /* fall through */ }

  try {
    const r = await fetch(`https://api.github.com/users/${GH_USER}/events/public?per_page=100`)
    if (r.ok) {
      const events = await r.json()
      const days = new Array(14).fill(0)
      // Calendar-day buckets (local): completed days are fixed, today is the
      // live last bar — same solidify-on-rollover model as the caffeine series.
      const todayMidnight = new Date().setHours(0, 0, 0, 0)
      for (const e of events) {
        if (e.type !== 'PushEvent') continue
        const d = Math.floor((todayMidnight - new Date(e.created_at).setHours(0, 0, 0, 0)) / 8.64e7)
        if (d >= 0 && d <= 13) {
          days[13 - d] += e.payload?.commits?.length || 0
        }
      }
      return days
    }
  } catch { /* give up */ }

  return null
}

/* ------------------------------------------------------------------
 * ETHEREUM — live transactions/sec from the latest block.
 * ------------------------------------------------------------------ */
export async function fetchEthBlock() {
  try {
    const r = await fetch('https://ethereum-rpc.publicnode.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getBlockByNumber',
        params: ['latest', false],
        id: 1,
      }),
    })
    if (!r.ok) return null
    const b = (await r.json()).result
    if (!b) return null
    return {
      number: parseInt(b.number, 16),
      txCount: b.transactions.length,
      ts: parseInt(b.timestamp, 16),
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------
 * ETH PRICE — keyless, live. Coinbase 6-hour candles give both the
 * current price and a real ~3-day sparkline (newest bar first).
 * ------------------------------------------------------------------ */
export async function fetchEthPrice() {
  try {
    // daily candles; last 14 = two weeks
    const r = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=86400')
    if (!r.ok) return null
    const rows = await r.json() // [ time, low, high, open, close, volume ], newest first
    if (!Array.isArray(rows) || rows.length === 0) return null
    const series = rows.slice(0, 14).map((c) => c[4]).reverse() // oldest → newest close

    // y-axis floor = 0.6 * yesterday's close (rows[1]; rows[0] is today,
    // still forming). Crops the dead bottom of the range without hugging
    // the min; if a bar dips below it the chart recalcs down (PriceChart).
    const yClose = rows.length > 1 ? rows[1][4] : series[0]
    const floor = 0.6 * yClose

    return { price: rows[0][4], series, floor }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------
 * S&P 500 — daily closes. No keyless, CORS-enabled index source exists,
 * so this uses a free-tier API key + the SPY ETF (the S&P 500 tracker
 * available on free plans). Grab a free key in ~30s (no card):
 *   https://twelvedata.com/register
 * then paste it below. Daily data changes once a day, so we cache per
 * calendar day in localStorage — each visitor makes at most one request,
 * which keeps the free quota comfortable no matter the traffic.
 * (Want the real ^GSPC index number instead of the ETF? That needs a
 *  plan with index data, or a server-side fetch — ask and I'll wire it.)
 * ------------------------------------------------------------------ */
export const SP500_API_KEY = '' // <-- paste your free Twelve Data key here
export const SP500_SYMBOL = 'SPY' // S&P 500 ETF; use 'GSPC' if your plan has indices

export async function fetchSp500() {
  if (!SP500_API_KEY) return null
  const today = new Date().toISOString().slice(0, 10)
  try {
    const cached = JSON.parse(localStorage.getItem('sp500') || 'null')
    if (cached && cached.date === today && Array.isArray(cached.series)) return cached
  } catch { /* ignore bad cache */ }

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${SP500_SYMBOL}`
      + `&interval=1day&outputsize=8&apikey=${SP500_API_KEY}`
    const r = await fetch(url)
    if (!r.ok) return null
    const j = await r.json()
    if (!Array.isArray(j.values) || j.values.length === 0) return null
    const series = j.values.map((v) => Number(v.close)).reverse() // oldest → newest
    const out = { date: today, series, price: series[series.length - 1] }
    try { localStorage.setItem('sp500', JSON.stringify(out)) } catch { /* ignore */ }
    return out
  } catch {
    return null
  }
}

/* ==================================================================
 * HOOKS
 * ================================================================== */

const prefersReduced = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Lightweight "am I at the keyboard" flag for status bars. */
export function useActive() {
  const [active, setActive] = useState(null)
  useEffect(() => {
    let alive = true
    fetchStatus().then((s) => { if (alive && s) setActive(s.active) })
    const id = setInterval(() => {
      fetchStatus().then((s) => { if (alive && s) setActive(s.active) })
    }, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])
  return active
}

/** The full panel: caffeine, commits, eth tps, viewer fps + active flag. */
export function useMetrics() {
  const [drinks, setDrinks] = useState(null) // null = not loaded yet (never faked)
  const [active, setActive] = useState(null)
  const [mg, setMg] = useState(null)
  const [caffSeries, setCaffSeries] = useState([])
  const [commitDays, setCommitDays] = useState(null)
  const [tpsSeries, setTpsSeries] = useState([])
  const [ethPrice, setEthPrice] = useState(null)
  const [fps, setFps] = useState(null)

  // status (drink log + active): now, then every 2 min
  useEffect(() => {
    let alive = true
    const load = async () => {
      const s = await fetchStatus()
      if (!alive || !s) return // on failure keep last-known; never fabricate
      setDrinks(s.drinks)
      setActive(s.active)
    }
    load()
    const id = setInterval(load, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // recompute the decaying caffeine estimate every second (once loaded)
  useEffect(() => {
    if (!Array.isArray(drinks)) return
    const tick = () => {
      const now = Date.now()
      setMg(caffeineAt(drinks, now))
      setCaffSeries(caffeineSeries(drinks, now))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [drinks])

  // commits: now, then every 15 min
  useEffect(() => {
    let alive = true
    const load = async () => { const d = await fetchCommitDays(); if (alive && d) setCommitDays(d) }
    load()
    const id = setInterval(load, 900000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // eth transactions: poll the chain head every 12 s (~block time) and
  // record each new block's tx count; the displayed value is the sum
  // over the graphed blocks
  useEffect(() => {
    let alive = true
    const prev = { num: null }
    const poll = async () => {
      const b = await fetchEthBlock()
      if (!alive || !b || b.number === prev.num) return // skip repeat blocks
      prev.num = b.number
      setTpsSeries((s) => [...s.slice(-13), b.txCount])
    }
    poll()
    const id = setInterval(poll, 12000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // eth price: now, then every 60 s
  useEffect(() => {
    let alive = true
    const load = async () => { const p = await fetchEthPrice(); if (alive && p) setEthPrice(p) }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // s&p 500 row is hidden for now (no keyless browser source). fetchSp500
  // + SP500_API_KEY are left in place to re-wire when a source is chosen.

  // viewer's own render framerate
  useEffect(() => {
    if (prefersReduced()) return
    let raf, frames = 0, last = performance.now(), stop = false
    const loop = (now) => {
      frames++
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      if (!stop) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { stop = true; cancelAnimationFrame(raf) }
  }, [])

  return {
    caffeine: { mg, series: caffSeries, active },
    commits: { days: commitDays, total: commitDays ? commitDays.reduce((a, b) => a + b, 0) : null },
    eth: {
      total: tpsSeries.length ? tpsSeries.reduce((a, b) => a + b, 0) : null,
      series: tpsSeries,
    },
    ethPrice, // { price, series } | null
    fps,
    active,
  }
}

/* Metrics live in a provider mounted above the router (see MetricsProvider),
 * so the polled/rolling data survives client-side navigation — leave the
 * home page and come back and nothing resets while the tab stays open. */
export const MetricsContext = createContext(null)
export function useMetricsValue() {
  return useContext(MetricsContext)
}
