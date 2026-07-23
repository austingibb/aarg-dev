import { useState, useEffect } from 'react'

/* ------------------------------------------------------------------ *
 * Shared TUI building blocks for aarg.dev
 * Keyboard-first (arrows / j·k / g·G / Enter), mouse-friendly, no typing.
 * The roving-menu hook lives in ./useRovingMenu.js (fast-refresh wants
 * component files to export only components).
 * ------------------------------------------------------------------ */

/** Full-screen phosphor backdrop that centers a single window.
 *  `max` caps the width on big screens; it stays fluid below that. */
export function Screen({ children, align = 'center', max = '46rem' }) {
  return (
    <main
      className="min-h-svh flex justify-center px-4 py-10 sm:py-14"
      style={{ alignItems: align === 'top' ? 'flex-start' : 'center' }}
    >
      <div className="w-full" style={{ maxWidth: max }}>
        {children}
      </div>
    </main>
  )
}

/** Bordered window with a title tab on the top border and a right-side tag. */
export function Window({ title, tag, children, boot = true, className = '' }) {
  return (
    <section className={`tui-frame ${boot ? 'boot' : ''} ${className}`}>
      {title && <span className="tui-title">{title}</span>}
      {tag && <span className="tui-tag">{tag}</span>}
      {children}
    </section>
  )
}

/** A shell-prompt line:  austin@aarg.dev:~$ command */
export function Prompt({ cmd, cursor = false, path = '~', onCommandClick }) {
  return (
    <div className="leading-relaxed">
      <span className="prompt-sign">austin@aarg.dev</span>
      <span style={{ color: 'var(--dim)' }}>:</span>
      <span className="prompt-path">{path}</span>
      <span style={{ color: 'var(--dim)' }}>$ </span>
      {cmd && (onCommandClick ? (
        <button
          type="button"
          className="prompt-cmd is-clickable"
          onClick={onCommandClick}
          aria-label={`${cmd} — open command prompt`}
        >
          {cmd}
        </button>
      ) : <span className="prompt-cmd">{cmd}</span>)}
      {cursor && <span className="cursor" aria-hidden="true" />}
    </div>
  )
}

/* --------------------------- sparkline ---------------------------- *
 * Render a numeric series as unicode blocks. Auto-normalizes to its
 * own min/max so whatever the data's range, the shape reads clearly.
 * ----------------------------------------------------------------- */
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

export function Spark({ values, color = '', width = 14 }) {
  // The cell is the row's shock absorber on narrow screens (flexShrink 999,
  // vs 1 on the label): glyphs are right-aligned inside a clipping flex box,
  // so when space runs out the OLDEST bars crop off the left — the right end
  // is the live data, and losing it is the worst possible crop.
  const cell = { display: 'flex', justifyContent: 'flex-end', minWidth: 0, flexShrink: 999 }
  if (!values || values.length === 0) {
    return (
      <span className={`spark ${color}`} style={{ ...cell, opacity: 0.4 }}>
        <span style={{ flexShrink: 0 }}>{'·'.repeat(width)}</span>
      </span>
    )
  }
  const v = values.slice(-width)
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const glyphs = v.map((x) => BLOCKS[Math.round(((x - min) / span) * 7)]).join('')
  const pad = width - v.length
  return (
    <span className={`spark ${color}`} style={cell}>
      <span style={{ flexShrink: 0 }}>
        {pad > 0 && <span style={{ opacity: 0.4 }}>{'·'.repeat(pad)}</span>}
        {glyphs}
      </span>
    </span>
  )
}

/* A taller bar chart with an intelligent baseline: it starts at `floor`
 * (e.g. 0.6 * yesterday's average) to crop the dead bottom of the range
 * without hugging the min. If price dips below the floor, the baseline
 * recalcs just under the low so bars never clip. Horizontal gridlines
 * mark every `tick` units, and the baseline value is printed below
 * (prefixed with `unit` — '$' for prices, '' for unitless indexes).
 * `xTicks` ([{ i, label }]) draws a tick on the baseline at bar i's left
 * edge with the label beneath — for year marks on multi-year series. */
export function PriceChart({ values, color = 'cyan', height = '3.5rem', floor = 0, tick = 250, unit = '$', xTicks }) {
  const v = Array.isArray(values) ? values : []
  if (v.length === 0) {
    return <div style={{ height, opacity: 0.4, color: 'var(--dim)' }} className="text-xs">no data</div>
  }
  // round the floor up to a clean multiple of `tick`, then step back down
  // in `tick` increments if that would clip the data — the baseline is
  // always a clean number and always below the lowest bar
  const min = Math.min(...v)
  let lo = Math.ceil(floor / tick) * tick
  while (lo >= min) lo -= tick
  const top = Math.max(...v) * 1.02
  const span = top - lo || 1

  // gridline levels: multiples of `tick` inside the visible range
  const lines = []
  for (let t = Math.ceil(lo / tick) * tick; t < top; t += tick) lines.push(t)

  return (
    <div>
      <div style={{ position: 'relative', height, borderBottom: '1px solid var(--border-lit)' }}>
        {/* bars */}
        {/* long series (years of monthly bars) drop to a 1px gap so the
            bars themselves keep most of the width on narrow screens */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: v.length > 40 ? '1px' : '2px' }}>
          {v.map((x, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${Math.max(2, ((x - lo) / span) * 100)}%`,
                background: `var(--${color})`,
                opacity: 0.5 + 0.45 * (i / (v.length - 1 || 1)), // brighten toward now
                borderRadius: '1px 1px 0 0',
              }}
            />
          ))}
        </div>
        {/* x-axis ticks straddling the baseline */}
        {(xTicks || []).map(({ i }) => (
          <div
            key={i}
            style={{
              position: 'absolute', bottom: '-3px', width: '1px', height: '6px',
              left: `${(i / v.length) * 100}%`,
              background: 'var(--border-lit)', pointerEvents: 'none',
            }}
          />
        ))}
        {/* dotted $tick gridlines across the chart */}
        {lines.map((t) => (
          <div
            key={t}
            style={{
              position: 'absolute', left: 0, right: 0,
              bottom: `${((t - lo) / span) * 100}%`,
              borderTop: '1px dotted var(--border-lit)',
              opacity: 0.6, pointerEvents: 'none',
            }}
          />
        ))}
      </div>
      {/* baseline value at the left — the only labeled level — plus any
          x-axis labels centered under their ticks */}
      <div style={{ position: 'relative', fontSize: '0.55rem', color: 'var(--dim)', opacity: 0.85, marginTop: '2px' }}>
        {unit}{lo.toLocaleString()}
        {(xTicks || []).map(({ i, label }) => (
          <span
            key={i}
            style={{ position: 'absolute', top: 0, left: `${(i / v.length) * 100}%`, transform: 'translateX(-50%)' }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

/* Fixed column widths so the sparkline, time-span label, and value each
 * sit in their own column and line up across every row, regardless of
 * how wide the text is. */
const LABEL_W = '9.8em' // wide enough for "eth transactions"
const SPARK_W = 14   // one cell per point for the 14-point (2-week / 14h) series
const SPAN_W = '2.4em'
const VALUE_W = '4.7em'

/** The right-hand pair of fixed columns: time-span + kind, then value.
 *  `kind` says what the number is: 'Σ' = sum over the window,
 *  'now' = the current / latest value. */
function Tail({ span, kind, value }) {
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
      <span
        style={{
          width: SPAN_W, textAlign: 'right', color: 'var(--dim)', opacity: 0.7,
          fontSize: '0.62rem', display: 'flex', flexDirection: 'column', lineHeight: 1.25,
        }}
      >
        <span>{span}</span>
        {kind && <span style={{ opacity: 0.8 }}>{kind}</span>}
      </span>
      <span className="tabular-nums" style={{ width: VALUE_W, textAlign: 'right', color: 'var(--fg)', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

function MetricRow({ label, color, values, value, span, kind }) {
  return (
    <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
      {/* flexShrink 1 (vs the spark cell's 999): the spark absorbs nearly all
          of a narrow squeeze; the label only ellipsizes as a last resort */}
      <span
        style={{
          color: 'var(--dim)', width: LABEL_W, flexShrink: 1, minWidth: '4.5em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      <Spark values={values} color={color} width={SPARK_W} />
      <Tail span={span} kind={kind} value={value} />
    </div>
  )
}

/** A section header: amber title + a faint comment line beneath it. */
function SectionLabel({ title, note }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--amber)' }}>{title}</p>
      {note && (
        <p style={{ color: 'var(--dim)', opacity: 0.7, fontSize: '0.62rem', marginTop: '2px' }}>
          {note}
        </p>
      )}
    </div>
  )
}

/* ------------------------- activity panel ------------------------- *
 * Split into two jokes:
 *   system        — austin's own vitals, metered like the machine he
 *                   treats me as (caffeine, commits)
 *   for fun graphs — external live data, purely for vibes (eth)
 * ----------------------------------------------------------------- */
export function Activity({ metrics }) {
  const { caffeine, commits, eth, ethPrice, sp500, swdev } = metrics
  // year boundaries for the swdev x-axis: series is one bar per month from
  // Feb 2020, so each January sits at index (year - 2020) * 12 - 1
  const swdevYears = swdev
    ? Array.from({ length: new Date().getFullYear() - 2020 }, (_, k) => 2021 + k)
        .map((y) => ({ i: (y - 2020) * 12 - 1, label: String(y) }))
        .filter((t) => t.i < swdev.series.length)
    : []
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <SectionLabel title="system" note="// austin telemetry" />
        <MetricRow
          label="caffeine" color="amber" values={caffeine.series} span="13h" kind="now"
          value={caffeine.mg != null ? `${Math.round(caffeine.mg)}mg` : '—'}
        />
        <MetricRow
          label="commits" color="" values={commits.days} span="2w" kind="Σ"
          value={commits.total != null ? String(commits.total) : '···'}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel title="for fun graphs" note="// external, just for the vibes." />
        <MetricRow
          label="eth transactions" color="cyan" values={eth.series} span="~3m" kind="Σ"
          value={eth.total != null ? eth.total.toLocaleString() : '···'}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
            <span style={{ color: 'var(--dim)', width: LABEL_W, flexShrink: 0 }}>eth $</span>
            <Tail span="2w" kind="now" value={ethPrice ? `$${Math.round(ethPrice.price).toLocaleString()}` : '···'} />
          </div>
          <PriceChart values={ethPrice?.series} color="cyan" floor={ethPrice?.floor} />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
            <span style={{ color: 'var(--dim)', width: LABEL_W, flexShrink: 0 }}>s&amp;p 500</span>
            <Tail span="2w" kind="now" value={sp500 ? `$${Math.round(sp500.price).toLocaleString()}` : '···'} />
          </div>
          <PriceChart values={sp500?.series} color="green" floor={sp500?.floor} />
        </div>
        {/* Indeed Hiring Lab US software-dev postings index, Feb 2020 = 100.
            Monthly bars over the whole run — the boom-and-bust arc is the
            point, not the last two weeks. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
            <span
              style={{ color: 'var(--dim)', width: LABEL_W, flexShrink: 0 }}
              title="Indeed Hiring Lab: US software development job postings index, Feb 1 2020 = 100 (via FRED)"
            >
              swe job postings
            </span>
            <Tail
              span={`${new Date().getFullYear() - 2020}y`} kind="now"
              value={swdev ? swdev.index.toFixed(1) : '···'}
            />
          </div>
          <PriceChart values={swdev?.series} color="amber" floor={50} tick={50} unit="" xTicks={swdevYears} />
          {/* Hiring Lab publishes this data freely on the condition that
              Indeed is cited as the source. */}
          <p className="chart-src">
            {'// '}
            <a href="https://data.indeed.com/#/postings" target="_blank" rel="noopener noreferrer">
              indeed hiring lab
            </a>
            {' · feb 2020 = 100'}
          </p>
        </div>
      </section>
    </div>
  )
}

/** Status-bar presence dot. active: true=working, false=away, null=unknown. */
export function StatusDot({ active }) {
  const label = active === true ? 'active' : active === false ? 'away' : 'online'
  return (
    <span>
      <span className={`dot ${active === false ? 'idle' : ''}`} /> &nbsp;{label}
    </span>
  )
}

/** Live wall clock for the status bar. */
export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const t = now.toLocaleTimeString('en-US', { hour12: false })
  return <span style={{ color: 'var(--fg)' }}>{t}</span>
}

/* ========================= timezones.sh ==========================
 * A cute world clock: a low-res world map drawn with block glyphs,
 * numbered markers at a handful of cities, and a live legend of the
 * local time in each. Meant for a full-color, block-glyph-capable
 * terminal (Ghostty, kitty, WezTerm, iTerm2…).
 *
 * The map is generated, not hand-drawn: continents are unions of
 * ellipses in lon/lat space, and both land cells and city markers use
 * the same equirectangular projection, so markers always land on (or
 * beside) the coast they belong to.
 * ================================================================= */

const MAP_W = 72
const MAP_H = 26
const LAT_TOP = 82
const LAT_BOT = -56

// [centerLon, centerLat, radiusLon, radiusLat] blobs, unioned into land.
const CONTINENTS = [
  [-100, 45, 30, 22],   // north america
  [-140, 62, 22, 11],   // alaska + nw canada
  [-85, 14, 9, 13],     // central america
  [-42, 72, 13, 9],     // greenland
  [-19, 65, 6, 5],      // iceland
  [-60, -15, 15, 28],   // south america
  [15, 52, 20, 12],     // europe
  [-3, 54, 5, 7],       // british isles
  [18, 3, 20, 32],      // africa
  [86, 50, 50, 28],     // asia (north / central) — pulled west to leave a sea gap off japan
  [153, 64, 27, 9],     // ne siberia: chukotka / kamchatka peninsula (top-right)
  [50, 28, 18, 14],     // middle east
  [78, 22, 12, 15],     // india
  [110, 5, 20, 12],     // se asia / indonesia
  [115, 18, 11, 12],    // south china coast / indochina / philippines
  [132, -26, 20, 13],   // australia
  [147, -31, 9, 9],     // eastern australia
  [139.7, 35, 4, 5],    // japan — a small offshore island, not fused to the mainland
]

const projectCol = (lon) => Math.round(((lon + 180) / 360) * (MAP_W - 1))
const projectRow = (lat) => Math.round(((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * (MAP_H - 1))

const isLand = (lon, lat) =>
  CONTINENTS.some(([cx, cy, rx, ry]) => {
    const dx = (lon - cx) / rx
    const dy = (lat - cy) / ry
    return dx * dx + dy * dy <= 1
  })

// Precompute the base map once: each cell is 'ocean' | 'land' | 'coast'.
// A coast cell is land with at least one non-land 4-neighbour — it gets a
// lighter glyph so shorelines read against the interior fill.
const MAP_CELLS = (() => {
  const land = []
  for (let r = 0; r < MAP_H; r++) {
    const lat = LAT_TOP - (r / (MAP_H - 1)) * (LAT_TOP - LAT_BOT)
    land[r] = []
    for (let c = 0; c < MAP_W; c++) {
      const lon = -180 + (c / (MAP_W - 1)) * 360
      land[r][c] = isLand(lon, lat)
    }
  }
  const cells = []
  for (let r = 0; r < MAP_H; r++) {
    cells[r] = []
    for (let c = 0; c < MAP_W; c++) {
      if (!land[r][c]) { cells[r][c] = 'ocean'; continue }
      const edge =
        r === 0 || r === MAP_H - 1 || c === 0 || c === MAP_W - 1 ||
        !land[r - 1][c] || !land[r + 1][c] || !land[r][c - 1] || !land[r][c + 1]
      cells[r][c] = edge ? 'coast' : 'land'
    }
  }
  return cells
})()

const GLYPH = { ocean: '·', land: '█', coast: '▓' }
const CLS = { ocean: 'o', land: 'l', coast: 'c' }

// Single-char marker labels: 1–9, then a, b, c… so we stay one glyph wide
// per cell (two-digit numbers would break the monospace map alignment).
const tzLabel = (i) => (i < 9 ? String(i + 1) : String.fromCharCode(97 + i - 9))

const TZ_CITIES = [
  { name: 'san francisco', tz: 'America/Los_Angeles', lon: -122.4, lat: 37.8 },
  { name: 'denver',        tz: 'America/Denver',       lon: -105.0, lat: 39.7 },
  { name: 'new york',      tz: 'America/New_York',     lon: -74.0, lat: 40.7 },
  { name: 'são paulo',     tz: 'America/Sao_Paulo',    lon: -46.6, lat: -23.5 },
  { name: 'reykjavík',     tz: 'Atlantic/Reykjavik',   lon: -21.9, lat: 64.1 },
  { name: 'london',        tz: 'Europe/London',        lon: -0.1,  lat: 51.5 },
  { name: 'lagos',         tz: 'Africa/Lagos',         lon: 3.4,   lat: 6.5 },
  { name: 'tel aviv',      tz: 'Asia/Jerusalem',       lon: 34.8,  lat: 32.1 },
  { name: 'karachi',       tz: 'Asia/Karachi',         lon: 67.0,  lat: 24.9 },
  { name: 'mumbai',        tz: 'Asia/Kolkata',         lon: 72.9,  lat: 19.1 },
  { name: 'beijing',       tz: 'Asia/Shanghai',        lon: 116.4, lat: 39.9 },
  { name: 'shanghai',      tz: 'Asia/Shanghai',        lon: 121.5, lat: 31.2 },
  { name: 'hong kong',     tz: 'Asia/Hong_Kong',       lon: 114.2, lat: 22.3 },
  { name: 'manila',        tz: 'Asia/Manila',          lon: 121.0, lat: 14.6 },
  { name: 'tokyo',         tz: 'Asia/Tokyo',           lon: 139.7, lat: 35.7 },
  { name: 'sydney',        tz: 'Australia/Sydney',     lon: 151.2, lat: -33.9 },
].map((c, i) => ({ ...c, label: tzLabel(i), col: projectCol(c.lon), row: projectRow(c.lat) }))

// Marker label → city, keyed by "row,col", for the map overlay.
const TZ_MARKERS = new Map(TZ_CITIES.map((c) => [`${c.row},${c.col}`, c.label]))

/** Local time in a timezone as { hh, mm, weekday, hour, dayOffset, utc }. */
function cityTime(now, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', weekday: 'short',
  }).formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t)?.value ?? ''
  // Day offset vs. the viewer's own date (ISO date sorts + parses as UTC).
  const here = now.toLocaleDateString('en-CA')
  const there = now.toLocaleDateString('en-CA', { timeZone: tz })
  const dayOffset = Math.round((Date.parse(there) - Date.parse(here)) / 86400000)
  // "GMT+8" / "GMT-7" / "GMT" (for +0) → "utc+8" / "utc-7" / "utc+0".
  const gmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    .formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const utc = gmt.replace('GMT', 'utc').replace(/^utc$/, 'utc+0')
  return { hh: get('hour'), mm: get('minute'), weekday: get('weekday').toLowerCase(), hour: Number(get('hour')), dayOffset, utc }
}

/** timezones.sh — world clock map + live legend. */
export function Timezones() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="term-out tz-wrap">
      <p className="text-xs uppercase" style={{ color: 'var(--amber)', letterSpacing: '0.16em' }}>
        timezones.sh{' '}
        <span style={{ color: 'var(--dim)', textTransform: 'none', letterSpacing: 0 }}>— world clock</span>
      </p>

      <div className="tz-map" aria-hidden="true">
        {MAP_CELLS.map((row, r) => (
          <div key={r}>
            {row.map((kind, c) => {
              const marker = TZ_MARKERS.get(`${r},${c}`)
              if (marker) return <span key={c} className="m">{marker}</span>
              return <span key={c} className={CLS[kind]}>{GLYPH[kind]}</span>
            })}
          </div>
        ))}
      </div>

      <div className="tz-legend">
        {TZ_CITIES.map((city) => {
          const { hh, mm, weekday, hour, dayOffset, utc } = cityTime(now, city.tz)
          const daytime = hour >= 6 && hour < 18
          return (
            <div key={city.label} className="tz-city">
              <span className="n">{city.label}</span>
              <span className="nm">{city.name}</span>
              <span className="dn" style={{ color: daytime ? 'var(--amber)' : 'var(--cyan)' }}>
                {daytime ? '☀' : '☾'}
              </span>
              <span className="tm">{hh}:{mm}</span>
              <span className="off">
                {utc} · {weekday}{dayOffset !== 0 ? ` ${dayOffset > 0 ? '+' : ''}${dayOffset}d` : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================
   Form primitives — the first real inputs on aarg.dev.
   Safe alongside useRovingMenu, which ignores INPUT/TEXTAREA keys
   (see useRovingMenu.js — the INPUT/TEXTAREA guard).
   ============================================================ */

/** A labeled single-line input. */
export function Field({ label, type = 'text', value, onChange, placeholder, autoFocus, onEnter, name, autoComplete, disabled }) {
  return (
    <label className="tui-field">
      {label && <span className="tui-field-label">{label}</span>}
      <input
        className="tui-input"
        type={type}
        name={name}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) onEnter(e) }}
      />
    </label>
  )
}

/** A labeled multi-line textarea. */
export function TextArea({ label, value, onChange, rows = 6, placeholder }) {
  return (
    <label className="tui-field">
      {label && <span className="tui-field-label">{label}</span>}
      <textarea
        className="tui-input tui-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

/** A button. `variant="danger"` renders red (admin destructive actions). */
export function Button({ children, onClick, variant = '', type = 'button', disabled }) {
  return (
    <button
      type={type}
      className={`tui-btn${variant ? ` ${variant}` : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

/** A one-line status line: red (error), green (ok), or dim (info). */
export function Notice({ kind = 'info', children }) {
  const color = kind === 'error' ? 'var(--red)' : kind === 'ok' ? 'var(--green)' : 'var(--dim)'
  if (!children) return null
  return <p className="tui-notice" style={{ color }}>{children}</p>
}

/** A yes/no confirmation dialog. `variant="danger"` styles the confirm button red. */
export function Confirm({ message, confirmLabel = 'confirm', cancelLabel = 'cancel', variant = '', onConfirm, onCancel }) {
  return (
    <div className="tui-confirm">
      <p style={{ color: 'var(--fg-strong)', fontSize: '0.85rem' }}>{message}</p>
      <div className="flex items-center gap-3 mt-3">
        <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
        <Button onClick={onCancel}>{cancelLabel}</Button>
      </div>
    </div>
  )
}
