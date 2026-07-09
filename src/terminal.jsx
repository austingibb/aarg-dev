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
export function Prompt({ cmd, cursor = false, path = '~' }) {
  return (
    <div className="leading-relaxed">
      <span className="prompt-sign">austin@aarg.dev</span>
      <span style={{ color: 'var(--dim)' }}>:</span>
      <span className="prompt-path">{path}</span>
      <span style={{ color: 'var(--dim)' }}>$ </span>
      {cmd && <span className="prompt-cmd">{cmd}</span>}
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
  if (!values || values.length === 0) {
    return <span className={`spark ${color}`} style={{ opacity: 0.4 }}>{'·'.repeat(width)}</span>
  }
  const v = values.slice(-width)
  const min = Math.min(...v)
  const max = Math.max(...v)
  const span = max - min || 1
  const glyphs = v.map((x) => BLOCKS[Math.round(((x - min) / span) * 7)]).join('')
  const pad = width - v.length
  return (
    <span className={`spark ${color}`}>
      {pad > 0 && <span style={{ opacity: 0.4 }}>{'·'.repeat(pad)}</span>}
      {glyphs}
    </span>
  )
}

/* A taller bar chart with an intelligent baseline: it starts at `floor`
 * (e.g. 0.6 * yesterday's average) to crop the dead bottom of the range
 * without hugging the min. If price dips below the floor, the baseline
 * recalcs just under the low so bars never clip. */
export function PriceChart({ values, color = 'cyan', height = '2.75rem', floor = 0 }) {
  const v = Array.isArray(values) ? values : []
  if (v.length === 0) {
    return <div style={{ height, opacity: 0.4, color: 'var(--dim)' }} className="text-xs">no data</div>
  }
  const lo = Math.min(floor, Math.min(...v) * 0.995) // recalc down if price breached the floor
  const top = Math.max(...v) * 1.02
  const span = top - lo || 1
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height }}>
      {v.map((x, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(2, ((x - lo) / span) * 100)}%`,
            background: `var(--${color})`,
            opacity: 0.55 + 0.45 * (i / (v.length - 1 || 1)), // brighten toward now
            borderRadius: '1px 1px 0 0',
          }}
        />
      ))}
    </div>
  )
}

/** Faint caption naming a graph's time window (e.g. "10h", "3d"). */
function Span({ children }) {
  return (
    <span style={{ color: 'var(--dim)', marginLeft: 'auto', fontSize: '0.62rem', opacity: 0.75 }}>
      {children}
    </span>
  )
}

function MetricRow({ label, color, values, value, span }) {
  return (
    <div className="flex items-center text-xs" style={{ gap: '0.9rem' }}>
      <span style={{ color: 'var(--dim)', width: '5em', flexShrink: 0 }}>{label}</span>
      <Spark values={values} color={color} width={16} />
      {span && <Span>{span}</Span>}
      <span
        className="tabular-nums"
        style={{ color: 'var(--fg)', marginLeft: span ? 0 : 'auto', whiteSpace: 'nowrap' }}
      >
        {value}
      </span>
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
  const { caffeine, commits, eth, ethPrice } = metrics
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <SectionLabel title="system" note="// you treat me like a machine. here's your telemetry." />
        <MetricRow
          label="caffeine" color="amber" values={caffeine.series} span="10h"
          value={caffeine.mg != null ? `${Math.round(caffeine.mg)}mg` : '—'}
        />
        <MetricRow
          label="commits" color="" values={commits.days} span="7d"
          value={commits.total != null ? String(commits.total) : '···'}
        />
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionLabel title="for fun graphs" note="// external, just for the vibes." />
        <MetricRow
          label="eth tps" color="cyan" values={eth.series} span="~3m"
          value={eth.tps != null ? String(Math.round(eth.tps)) : '···'}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center text-xs" style={{ gap: '0.9rem' }}>
            <span style={{ color: 'var(--dim)', width: '5em', flexShrink: 0 }}>eth $</span>
            <Span>3d</Span>
            <span className="tabular-nums" style={{ color: 'var(--fg)', whiteSpace: 'nowrap' }}>
              {ethPrice ? `$${Math.round(ethPrice.price).toLocaleString()}` : '···'}
            </span>
          </div>
          <PriceChart values={ethPrice?.series} color="cyan" floor={ethPrice?.floor} />
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
