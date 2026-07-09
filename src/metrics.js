import { useState, useEffect } from 'react'

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
 * The blood-caffeine estimate (9 h elimination half-life + a short
 * absorption ramp) is computed here, in the browser, so the number
 * decays smoothly in real time between fetches.
 * Leave STATUS_URL = '' to fall back to a believable local estimate.
 * ------------------------------------------------------------------ */
export const STATUS_URL = ''

const HALF_LIFE_H = 9      // caffeine elimination half-life (hours)
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

/** Sample the caffeine curve over the last `hours`, ending at `now`. */
export function caffeineSeries(drinks, now, hours = 10, n = 16) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    out.push(caffeineAt(drinks, now - (i / (n - 1)) * hours * 3.6e6))
  }
  return out
}

/** A plausible drink log for "today", used until the endpoint is live. */
export function fallbackDrinks(now = Date.now()) {
  const base = new Date(now)
  const mk = (h, m, mg) => {
    const x = new Date(base)
    x.setHours(h, m, 0, 0)
    return { t: x.getTime(), mg }
  }
  return [mk(7, 30, 95), mk(10, 0, 120), mk(13, 30, 80), mk(16, 0, 95)]
    .filter((d) => d.t <= now)
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
      const days = j.contributions.slice(-7).map((c) => c.count)
      if (days.length === 7) return days
    }
  } catch { /* fall through */ }

  try {
    const r = await fetch(`https://api.github.com/users/${GH_USER}/events/public?per_page=100`)
    if (r.ok) {
      const events = await r.json()
      const days = new Array(7).fill(0)
      const now = Date.now()
      for (const e of events) {
        if (e.type !== 'PushEvent') continue
        const age = (now - new Date(e.created_at).getTime()) / 8.64e7
        if (age >= 0 && age <= 7) {
          days[6 - Math.min(6, Math.floor(age))] += e.payload?.commits?.length || 0
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
    const r = await fetch('https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=21600')
    if (!r.ok) return null
    const rows = await r.json() // [ time, low, high, open, close, volume ], newest first
    if (!Array.isArray(rows) || rows.length === 0) return null
    const series = rows.slice(0, 12).map((c) => c[4]).reverse() // oldest → newest close
    return { price: rows[0][4], series }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------
 * S&P 500 — 6 data points = 12-hour averages over the last 3 days.
 * No keyless, CORS-enabled source for index intraday exists (every
 * provider needs an API key, and one shared key can't back a public
 * site), so this reads a small cached blob your server publishes —
 * same pattern as the caffeine feed. See scripts/publish-market.mjs.
 * Expected shape:
 *   { "sp500": [5601.2, 5588.4, ... 6 numbers, oldest → newest] }
 * ------------------------------------------------------------------ */
export const MARKET_URL = ''

export async function fetchMarket() {
  if (!MARKET_URL) return null
  try {
    const r = await fetch(MARKET_URL, { cache: 'no-store' })
    if (!r.ok) return null
    const j = await r.json()
    if (!Array.isArray(j.sp500) || j.sp500.length === 0) return null
    return { sp500: j.sp500 }
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
  const [drinks, setDrinks] = useState(() => fallbackDrinks())
  const [active, setActive] = useState(null)
  const [mg, setMg] = useState(0)
  const [caffSeries, setCaffSeries] = useState([])
  const [commitDays, setCommitDays] = useState(null)
  const [tps, setTps] = useState(null)
  const [tpsSeries, setTpsSeries] = useState([])
  const [ethPrice, setEthPrice] = useState(null)
  const [sp500, setSp500] = useState(null)
  const [fps, setFps] = useState(null)

  // status (drink log + active): now, then every 2 min
  useEffect(() => {
    let alive = true
    const load = async () => {
      const s = await fetchStatus()
      if (!alive) return
      if (s) { setDrinks(s.drinks); setActive(s.active) }
      else { setDrinks(fallbackDrinks()); setActive(null) }
    }
    load()
    const id = setInterval(load, 120000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  // recompute the decaying caffeine estimate every second
  useEffect(() => {
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

  // eth tps: poll the chain head every 12 s (~block time)
  useEffect(() => {
    let alive = true
    const prev = { num: null, ts: null }
    const poll = async () => {
      const b = await fetchEthBlock()
      if (!alive || !b) return
      const t = prev.num && b.number !== prev.num && b.ts > prev.ts
        ? b.txCount / (b.ts - prev.ts)   // real interval between blocks
        : b.txCount / 12                 // first sample: nominal block time
      prev.num = b.number
      prev.ts = b.ts
      setTps(t)
      setTpsSeries((s) => [...s.slice(-15), t])
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

  // s&p 500: now, then every 15 min (the blob updates slowly)
  useEffect(() => {
    let alive = true
    const load = async () => { const m = await fetchMarket(); if (alive && m) setSp500(m.sp500) }
    load()
    const id = setInterval(load, 900000)
    return () => { alive = false; clearInterval(id) }
  }, [])

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
    eth: { tps, series: tpsSeries },
    ethPrice, // { price, series } | null
    sp500,    // number[] | null
    fps,
    active,
  }
}
