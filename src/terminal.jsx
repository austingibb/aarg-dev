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

function MetricRow({ label, color, values, value }) {
  return (
    <div className="flex items-center text-xs" style={{ gap: '0.9rem' }}>
      <span style={{ color: 'var(--dim)', width: '5em', flexShrink: 0 }}>{label}</span>
      <Spark values={values} color={color} width={16} />
      <span
        className="tabular-nums"
        style={{ color: 'var(--fg)', marginLeft: 'auto', whiteSpace: 'nowrap' }}
      >
        {value}
      </span>
    </div>
  )
}

/* ------------------------- activity panel ------------------------- *
 * Real telemetry, each metric confined to its own cell:
 *   caffeine — blood estimate (9 h half-life, computed live)
 *   commits  — your GitHub contributions, last 7 days
 *   eth tps  — live Ethereum transactions/sec
 *   render   — the viewer's own framerate
 * ----------------------------------------------------------------- */
export function Activity({ metrics }) {
  const { caffeine, commits, eth, ethPrice, sp500, fps } = metrics
  return (
    <div className="flex flex-col gap-2.5">
      <MetricRow
        label="caffeine" color="amber" values={caffeine.series}
        value={`${Math.round(caffeine.mg)}mg`}
      />
      <MetricRow
        label="commits" color="" values={commits.days}
        value={commits.total != null ? `${commits.total}/7d` : '···'}
      />
      <MetricRow
        label="eth tps" color="cyan" values={eth.series}
        value={eth.tps != null ? String(Math.round(eth.tps)) : '···'}
      />
      <MetricRow
        label="eth $" color="cyan" values={ethPrice?.series}
        value={ethPrice ? `$${Math.round(ethPrice.price).toLocaleString()}` : '···'}
      />
      <MetricRow
        label="s&p 500" color="" values={sp500}
        value={sp500 ? Math.round(sp500[sp500.length - 1]).toLocaleString() : '···'}
      />
      <div className="flex items-center text-xs" style={{ gap: '0.9rem', color: 'var(--dim)' }}>
        <span style={{ width: '5em', flexShrink: 0 }}>render</span>
        <span
          className="tabular-nums"
          style={{ color: 'var(--green)', marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          {fps != null ? `${fps} fps` : '—'}
        </span>
      </div>
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
