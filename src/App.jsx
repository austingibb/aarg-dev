import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen, Window, Prompt, Activity, Clock, StatusDot, Field, Button, Notice, Confirm } from './terminal.jsx'
import { useRovingMenu } from './useRovingMenu.js'
import { useMetricsValue } from './metrics.js'
import { useAuth } from './auth.js'
import { adminLogin, logout } from './api.js'

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
  const metrics = useMetricsValue()
  const { user, refresh } = useAuth()

  // Dynamic links: base + (whitelisted? amber clip) + (email? logout : login) + (admin? red admin).
  const links = [
    ...LINKS,
    ...(user?.whitelisted ? [{ label: 'clip', hint: 'ephemeral text drop', to: '/clip', variant: 'clip' }] : []),
    ...(user?.email
      ? [{ label: 'logout', hint: user.email, action: 'logout' }]
      : [{ label: 'login',  hint: 'sign in / sign up', to: '/login' }]),
    ...(user?.admin ? [{ label: 'admin', hint: 'root console', to: '/admin', variant: 'admin' }] : []),
  ]

  const { rowProps } = useRovingMenu(links.length)

  // ---- command prompt state ----
  const [cmd, setCmd] = useState('')
  const [adminPrompt, setAdminPrompt] = useState(null) // null | { psk, totp, err, busy }
  const [notice, setNotice] = useState(null)            // { kind, text }
  const [confirmLogout, setConfirmLogout] = useState(false)
  const inputRef = useRef(null)

  // Esc focuses the command prompt.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        inputRef.current?.focus()
        setAdminPrompt(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function runCommand(raw) {
    const c = raw.trim()
    if (!c) return
    setNotice(null)

    if (c === '.\\admin-login.sh' || c === './admin-login.sh' || c === 'admin-login') {
      setAdminPrompt({ psk: '', totp: '', err: '', busy: false })
      setCmd('')
      return
    }
    if (c === 'help') {
      setNotice({ kind: 'info', text: 'commands: .\\admin-login.sh — open the root login prompt' })
      setCmd('')
      return
    }
    setNotice({ kind: 'error', text: `command not found: ${c}` })
    setCmd('')
  }

  async function submitAdmin(e) {
    e?.preventDefault()
    if (!adminPrompt || adminPrompt.busy) return
    if (!adminPrompt.psk || adminPrompt.totp.length !== 6) {
      setAdminPrompt({ ...adminPrompt, err: 'psk and 6-digit totp required' })
      return
    }
    setAdminPrompt({ ...adminPrompt, busy: true, err: '' })
    try {
      await adminLogin(adminPrompt.psk, adminPrompt.totp)
      await refresh()
      setAdminPrompt(null)
      setNotice({ kind: 'ok', text: 'root session active — 12h' })
    } catch (e2) {
      setAdminPrompt({ ...adminPrompt, busy: false, err: e2?.error || 'invalid credentials', psk: '', totp: '' })
    }
  }

  async function doLogout() {
    await logout()
    await refresh()
    setConfirmLogout(false)
    setNotice({ kind: 'info', text: 'logged out' })
  }

  return (
    <Screen max="64rem">
      <Window title="aarg.dev" tag={metrics.fps != null ? `${metrics.fps} fps` : 'session'}>
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
              wondering what Austin would do if he stopped coding. I guess we&apos;ll never know.
            </p>
          </div>
          <div className="mt-4">
            {/* command prompt — Esc to focus, type .\admin-login.sh for root login */}
            <div className="tui-prompt-line">
              <span className="prompt-sign">austin@aarg.dev</span>
              <span style={{ color: 'var(--dim)' }}>:</span>
              <span className="prompt-path">~</span>
              <span style={{ color: 'var(--dim)' }}>$ </span>
              <input
                ref={inputRef}
                className="tui-prompt-input"
                value={cmd}
                placeholder="type a command — esc to focus"
                onChange={(e) => setCmd(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') runCommand(cmd) }}
                autoComplete="off" spellCheck="false"
              />
            </div>
            {notice && <div className="mt-2"><Notice kind={notice.kind}>{notice.text}</Notice></div>}

            {/* inline admin login (PSK + TOTP) — opened by .\admin-login.sh */}
            {adminPrompt && (
              <form onSubmit={submitAdmin} className="mt-3 flex flex-col gap-3" style={{ maxWidth: '24rem' }}>
                <Field
                  label="psk" type="password" value={adminPrompt.psk}
                  autoFocus autoComplete="off"
                  placeholder="••••••••"
                  onChange={(v) => setAdminPrompt({ ...adminPrompt, psk: v })}
                  onEnter={submitAdmin}
                />
                <Field
                  label="totp (6 digits)" value={adminPrompt.totp}
                  onChange={(v) => setAdminPrompt({ ...adminPrompt, totp: v.replace(/\D/g, '').slice(0, 6) })}
                  onEnter={submitAdmin} placeholder="000000" autoComplete="one-time-code"
                />
                <div className="flex items-center gap-3">
                  <Button onClick={submitAdmin} disabled={adminPrompt.busy || !adminPrompt.psk || adminPrompt.totp.length !== 6}>
                    {adminPrompt.busy ? '…' : 'authenticate'}
                  </Button>
                  <button type="button" className="text-xs" style={{ color: 'var(--dim)' }}
                    onClick={() => setAdminPrompt(null)}>cancel</button>
                </div>
                {adminPrompt.err && <Notice kind="error">{adminPrompt.err}</Notice>}
              </form>
            )}
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
            {links.map((item, i) => {
              const common = rowProps(i)
              const variantClass = item.variant === 'admin' ? ' is-admin' : ''
              const className = `${common.className}${variantClass}`
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
              if (item.action === 'logout') {
                return (
                  <a
                    key={item.label}
                    {...common}
                    className={className}
                    href="/"
                    onClick={(e) => { e.preventDefault(); setConfirmLogout(true) }}
                  >
                    {inner}
                  </a>
                )
              }
              return item.to ? (
                <a
                  key={item.label}
                  {...common}
                  className={className}
                  href={item.to}
                  onClick={(e) => { e.preventDefault(); navigate(item.to) }}
                >
                  {inner}
                </a>
              ) : (
                <a
                  key={item.label}
                  {...common}
                  className={className}
                  href={item.href} target="_blank" rel="noopener noreferrer"
                >
                  {inner}
                </a>
              )
            })}
          </nav>

          {/* live telemetry cell */}
          <aside
            className="w-full sm:w-[25rem] shrink-0 px-6 py-5 border-t sm:border-t-0"
            style={{ borderColor: 'var(--border)' }}
          >
            <Activity metrics={metrics} />
          </aside>
        </div>

        {confirmLogout && (
          <div className="px-6 py-4">
            <Confirm
              message="log out of your user account? (admin session stays active)"
              confirmLabel="log out"
              onConfirm={doLogout}
              onCancel={() => setConfirmLogout(false)}
            />
          </div>
        )}

        <hr className="tui-sep" />

        {/* status bar */}
        <div className="px-6 py-3 tui-status">
          <StatusDot active={metrics.active} />
          <span><kbd>↑</kbd>/<kbd>↓</kbd> move</span>
          <span><kbd>⏎</kbd> open</span>
          <span><kbd>esc</kbd> prompt</span>
          <span className="hidden sm:inline"><kbd>j</kbd>/<kbd>k</kbd> vim</span>
          <span style={{ marginLeft: 'auto' }}>
            <span style={{ color: 'var(--dim)' }}>{user?.email ?? 'guest'}</span>
            {user?.admin && <span style={{ color: 'var(--red)' }}> · root</span>}
            <span style={{ color: 'var(--dim)' }}> · </span>
            <Clock />
          </span>
        </div>
      </Window>
    </Screen>
  )
}
