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
export function Window({ title, tag, children, boot = true, className = '', widgetId, instanceId }) {
  return (
    <section data-widget={widgetId} data-widget-instance={instanceId} className={`tui-frame ${boot ? 'boot' : ''} ${className}`}>
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
                opacity: 0.85,
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
