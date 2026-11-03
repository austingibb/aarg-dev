import { useState, useEffect } from 'react'

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
  [106, 4, 15, 10],     // se asia / indonesia — kept west of the philippines
  [115, 18, 11, 8],     // south china coast / indochina
  [121, 24, 3, 5],      // taiwan — a distinct island off the china coast
  [121, 15, 3, 4],      // philippines — detached for clarity at this resolution
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
  { name: 'taipei',        tz: 'Asia/Taipei',          lon: 121.6, lat: 25.0 },
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
export default function Timezones() {
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

