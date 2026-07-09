import { useState, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------ *
 * Shared TUI building blocks for aarg.dev
 * Keyboard-first (arrows / j·k / g·G / Enter), mouse-friendly, no typing.
 * The roving-menu hook lives in ./useRovingMenu.js (fast-refresh wants
 * component files to export only components).
 * ------------------------------------------------------------------ */

/** Full-screen phosphor backdrop that centers a single window. */
export function Screen({ children, align = 'center' }) {
  return (
    <main
      className="min-h-svh flex justify-center px-4 py-10 sm:py-14"
      style={{ alignItems: align === 'top' ? 'flex-start' : 'center' }}
    >
      <div className="w-full" style={{ maxWidth: '46rem' }}>
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

/* ------------------------- activity panel ------------------------- *
 * A single "cell" that animates on its own: seeded random-walk
 * sparklines + a live uptime clock. Freezes under reduced-motion.
 * ----------------------------------------------------------------- */
const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█']

function useSparkline(width, seed) {
  const [bars, setBars] = useState(() =>
    Array.from({ length: width }, (_, i) => (Math.sin(i * seed) + 1) * 3.5),
  )
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    const id = setInterval(() => {
      setBars((prev) => {
        const next = prev.slice(1)
        const last = prev[prev.length - 1]
        let v = last + (Math.random() - 0.5) * 3
        v = Math.max(0, Math.min(7, v))
        next.push(v)
        return next
      })
    }, 620)
    return () => clearInterval(id)
  }, [seed])
  const line = bars.map((v) => BLOCKS[Math.round(v)]).join('')
  const latest = bars[bars.length - 1] / 7 // 0..1
  return { line, latest }
}

function SparkRow({ label, color, width, seed, format }) {
  const { line, latest } = useSparkline(width, seed)
  return (
    <div className="flex items-center gap-3 text-xs">
      <span style={{ color: 'var(--dim)', width: '4.5em' }}>{label}</span>
      <span className={`spark ${color}`}>{line}</span>
      <span
        style={{ color: 'var(--dim)', marginLeft: 'auto' }}
        className="tabular-nums"
      >
        {format(latest)}
      </span>
    </div>
  )
}

export function Activity() {
  const start = useRef(null)
  const [uptime, setUptime] = useState('00:00:00')
  useEffect(() => {
    start.current = Date.now()
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - start.current) / 1000)
      const hh = String(Math.floor(s / 3600)).padStart(2, '0')
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setUptime(`${hh}:${mm}:${ss}`)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col gap-2.5">
      <SparkRow label="signal"  color=""      width={20} seed={0.7}
        format={(v) => `${String(Math.round(v * 100)).padStart(3, ' ')}%`} />
      <SparkRow label="deploys" color="amber" width={20} seed={1.3}
        format={(v) => String(Math.round(v * 9)).padStart(3, ' ')} />
      <SparkRow label="coffee"  color="cyan"  width={20} seed={2.1}
        format={(v) => `${String(Math.round(80 + v * 240))}mg`} />
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--dim)' }}>
        <span style={{ width: '4.5em' }}>session</span>
        <span style={{ color: 'var(--green)' }}>{uptime}</span>
      </div>
    </div>
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
