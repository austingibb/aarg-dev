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
    // flexShrink 0: never let a tight flex row shrink+clip the newest bars
    // (the right end is the live data — losing it is the worst possible crop)
    <span className={`spark ${color}`} style={{ flexShrink: 0 }}>
      {pad > 0 && <span style={{ opacity: 0.4 }}>{'·'.repeat(pad)}</span>}
      {glyphs}
    </span>
  )
}

/* A taller bar chart with an intelligent baseline: it starts at `floor`
 * (e.g. 0.6 * yesterday's average) to crop the dead bottom of the range
 * without hugging the min. If price dips below the floor, the baseline
 * recalcs just under the low so bars never clip. Horizontal gridlines
 * mark every `tick` dollars, and the baseline value is printed below. */
export function PriceChart({ values, color = 'cyan', height = '3.5rem', floor = 0, tick = 250 }) {
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
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
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
      {/* baseline value — the only labeled level */}
      <div style={{ fontSize: '0.55rem', color: 'var(--dim)', opacity: 0.85, marginTop: '2px' }}>
        ${lo.toLocaleString()}
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
      <span style={{ color: 'var(--dim)', width: LABEL_W, flexShrink: 0 }}>{label}</span>
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
  const { caffeine, commits, eth, ethPrice, sp500 } = metrics
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

/* ============================================================
   Form primitives — the first real inputs on aarg.dev.
   Safe alongside useRovingMenu, which ignores INPUT/TEXTAREA keys
   (see useRovingMenu.js — the INPUT/TEXTAREA guard).
   ============================================================ */

/** A labeled single-line input. */
export function Field({ label, type = 'text', value, onChange, placeholder, autoFocus, onEnter, name, autoComplete }) {
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
