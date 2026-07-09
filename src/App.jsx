import { useNavigate } from 'react-router-dom'
import { Screen, Window, Prompt, Activity, Clock, StatusDot } from './terminal.jsx'
import { useRovingMenu } from './useRovingMenu.js'
import { useMetrics } from './metrics.js'

const LINKS = [
  { label: 'blog',      hint: 'writing & notes',        to: '/blog' },
  { label: 'cavewise',  hint: 'a game on itch.io',      href: 'https://austingibb.itch.io/cavewise' },
  { label: 'paste-book', hint: 'youtube → ebook',       href: 'https://paste-book.com' },
  { label: 'github',    hint: 'source & experiments',   href: 'https://github.com/austingibb' },
  { label: 'linkedin',  hint: 'the professional mask',  href: 'https://linkedin.com/in/austingibb' },
  { label: 'portfolio', hint: 'austingibb.com',         href: 'https://austingibb.com' },
]

function ArrowGlyph() {
  return <span className="arrow" aria-hidden="true">↵</span>
}

export default function App() {
  const navigate = useNavigate()
  const { rowProps } = useRovingMenu(LINKS.length)
  const metrics = useMetrics()

  return (
    <Screen max="64rem">
      <Window title="aarg.dev" tag="session · 01">
        {/* header */}
        <div className="px-6 pt-7 pb-5">
          <Prompt cmd="whoami" />
          <div className="mt-2 pl-0">
            <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--fg-strong)' }}>
              Austin Gibbons
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--dim)' }}>
              software engineer · builds odd useful things
            </p>
          </div>
          <div className="mt-4">
            <Prompt cmd="cat about.txt" />
            <p className="mt-1.5 text-sm max-w-prose" style={{ color: 'var(--fg)' }}>
              My messy corner of the internet for my own tech services. Everyone keeps
              wondering what Austin would do if he stopped coding — I guess we&apos;ll never know.
            </p>
          </div>
          <div className="mt-4">
            <Prompt cmd="ls ~/links" cursor />
          </div>
        </div>

        <hr className="tui-sep" />

        {/* body: nav + activity, side by side on wider screens */}
        <div className="flex flex-col sm:flex-row">
          {/* nav menu */}
          <nav
            aria-label="Site navigation"
            className="flex-1 py-3 sm:border-r"
            style={{ borderColor: 'var(--border)' }}
          >
            {LINKS.map((item, i) => {
              const common = rowProps(i)
              const inner = (
                <>
                  <span className="caret" aria-hidden="true">›</span>
                  <span className="idx">{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ color: 'inherit' }}>{item.label}</span>
                  <span className="hidden sm:inline text-xs" style={{ color: 'var(--dim)' }}>
                    &nbsp;— {item.hint}
                  </span>
                  <ArrowGlyph />
                </>
              )
              return item.to ? (
                <a
                  key={item.label}
                  {...common}
                  href={item.to}
                  onClick={(e) => { e.preventDefault(); navigate(item.to) }}
                >
                  {inner}
                </a>
              ) : (
                <a key={item.label} {...common} href={item.href} target="_blank" rel="noopener noreferrer">
                  {inner}
                </a>
              )
            })}
          </nav>

          {/* live telemetry cell */}
          <aside
            className="w-full sm:w-80 shrink-0 px-6 py-5 border-t sm:border-t-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--amber)' }}>
              system
            </p>
            <Activity metrics={metrics} />
          </aside>
        </div>

        <hr className="tui-sep" />

        {/* status bar */}
        <div className="px-6 py-3 tui-status">
          <StatusDot active={metrics.active} />
          <span><kbd>↑</kbd>/<kbd>↓</kbd> move</span>
          <span><kbd>⏎</kbd> open</span>
          <span className="hidden sm:inline"><kbd>j</kbd>/<kbd>k</kbd> vim</span>
          <span style={{ marginLeft: 'auto' }}><Clock /></span>
        </div>
      </Window>
    </Screen>
  )
}
