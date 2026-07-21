import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen, Window, Prompt, Activity, Clock, StatusDot, Field, Button, Notice, Confirm } from './terminal.jsx'
import { useRovingMenu } from './useRovingMenu.js'
import { useMetricsValue } from './metrics.js'
import { useAuth } from './auth.js'
import { adminLogin, logout } from './api.js'

/* ------------------------------------------------------------------ *
 * The home page is a terminal session, two columns wide:
 *   left  — the shell log: whoami, cat about.txt, then ./links.sh
 *           (the interactive site navigator). Esc SIGINTs links.sh,
 *           types `clear`, and drops you at a real prompt; Esc again
 *           clears and replays the boot, one animated command at a time.
 *   right — the telemetry graphs, independent of whatever the shell does.
 * ------------------------------------------------------------------ */

const LINKS = [
  { label: 'blog',      hint: 'writing & notes',        to: '/blog' },
  { label: 'cavewise',  hint: 'a game on itch.io',      href: 'https://austingibb.itch.io/cavewise' },
  { label: 'paste-book', hint: 'youtube → ebook',       href: 'https://paste-book.com' },
  { label: 'github',    hint: 'source & experiments',   href: 'https://github.com/austingibb' },
  { label: 'linkedin',  hint: 'professional profile',   href: 'https://linkedin.com/in/austingibb' },
  { label: 'portfolio', hint: 'austingibb.com',         href: 'https://austingibb.com' },
]

const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* The intro animation plays once per page load. Coming back from /blog,
 * /login, /admin, etc. remounts App — skip straight to the booted session
 * so in-site nav is snappy. A hard refresh still gets the animation. */
let bootedThisLoad = false
const BOOT_LOG = [
  { kind: 'cmd', text: 'whoami' },
  { kind: 'whoami' },
  { kind: 'cmd', text: 'cat about.txt' },
  { kind: 'about' },
  { kind: 'cmd', text: './links.sh' },
  { kind: 'links' },
]

const OUT_COLOR = { dim: 'var(--dim)', red: 'var(--red)', green: 'var(--green)', fg: 'var(--fg)' }
const LINKS_COMMANDS = new Set(['./links.sh', '.\\links.sh', 'links.sh', 'links', 'sh links.sh', 'bash links.sh'])
const isLinksCommand = (command) => LINKS_COMMANDS.has(command.trim())

function ArrowGlyph() {
  return <span className="arrow" aria-hidden="true">↵</span>
}

/* ---- output blocks ---- */

function WhoamiBlock() {
  return (
    <div className="term-out">
      <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--fg-strong)' }}>
        Austin Gibbons
      </h1>
      <p className="text-sm mt-0.5" style={{ color: 'var(--dim)' }}>
        software engineer · builds odd useful things
      </p>
    </div>
  )
}

function AboutBlock() {
  return (
    <p className="term-out text-sm max-w-prose" style={{ color: 'var(--fg)' }}>
      My messy corner of the internet for my own tech services. Everyone keeps
      wondering what Austin would do if he stopped coding. I guess we&apos;ll never know.
    </p>
  )
}

function LsBlock() {
  return (
    <div className="term-out flex flex-wrap" style={{ gap: '1.8rem', fontSize: '0.9rem' }}>
      <span style={{ color: 'var(--fg)' }}>about.txt</span>
      <span style={{ color: 'var(--green)' }}>admin-login.sh*</span>
      <span style={{ color: 'var(--cyan)' }}>fsociety00.dat</span>
      <span style={{ color: 'var(--green)' }}>links.sh*</span>
      <span style={{ color: 'var(--fg)' }}>readme.txt</span>
    </div>
  )
}

/* readme.txt — the note Elliot leaves on the encrypted archive
 * (Mr. Robot, "eps1.0_hellofriend.mov"). Rendered as the show frames it:
 * a ruled header, the line alone in the middle, a ruled footer. */
function ReadmeBlock() {
  return (
    <div className="term-out" style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
      <div style={{ color: 'var(--dim)' }}>---------- readme.txt ------------</div>
      <div
        style={{
          color: 'var(--amber)', letterSpacing: '0.22em',
          padding: '0.9rem 0 0.9rem 2.2rem',
        }}
      >
        LEAVE ME HERE
      </div>
      <div style={{ color: 'var(--dim)' }}>_________________________________</div>
    </div>
  )
}

export default function App() {
  const navigate = useNavigate()
  const metrics = useMetricsValue()
  const { user, refresh } = useAuth()

  // Dynamic links: base + (whitelisted? clip) + (email? logout : login) + (admin? red admin).
  const links = [
    ...LINKS,
    ...(user?.whitelisted ? [{ label: 'clip', hint: 'ephemeral text and small file drop', to: '/clip', variant: 'clip' }] : []),
    ...(user?.email
      ? [{ label: 'logout', hint: user.email, action: 'logout' }]
      : [{ label: 'login',  hint: 'sign in / sign up', to: '/login' }]),
    ...(user?.admin ? [{ label: 'admin', hint: 'root console', to: '/admin', variant: 'admin' }] : []),
  ]

  /* ---- terminal session state ----
   * mode: boot (startup animation) | links (links.sh running) |
   *       anim (esc transition)    | shell (interactive prompt)
   * lines: the scrollback — cmd lines and output blocks, in order. */
  const [mode, setMode] = useState(bootedThisLoad ? 'links' : 'boot')
  const [lines, setLines] = useState(bootedThisLoad ? BOOT_LOG : [])
  const [cmd, setCmd] = useState('')
  const [adminPrompt, setAdminPrompt] = useState(null) // null | { psk, totp, err, busy }
  const [confirmLogout, setConfirmLogout] = useState(false)

  const tokenRef = useRef(0)       // bump to cancel any in-flight animation
  const inputRef = useRef(null)
  const endRef = useRef(null)
  const histRef = useRef({ list: [], i: -1 })

  // links.sh is only interactive while it's the running program
  const { rowProps } = useRovingMenu(mode === 'links' ? links.length : 0)

  const push = (entry) => setLines((ls) => [...ls, entry])
  const cancelled = (t) => t !== tokenRef.current

  /* Type a command at a fresh prompt, char by char, then commit it. */
  async function typeCmd(t, text) {
    push({ kind: 'cmd', text: REDUCED ? text : '', live: true })
    if (!REDUCED) {
      for (let i = 1; i <= text.length; i++) {
        await sleep(24 + Math.random() * 34)
        if (cancelled(t)) return false
        const partial = text.slice(0, i)
        setLines((ls) => ls.map((l, j) => (j === ls.length - 1 ? { ...l, text: partial } : l)))
      }
      await sleep(150)
    }
    if (cancelled(t)) return false
    setLines((ls) => ls.map((l, j) => (j === ls.length - 1 ? { ...l, text, live: false } : l)))
    return true
  }

  /* The boot sequence: whoami → cat about.txt → ./links.sh */
  async function runBoot(t) {
    setMode('boot')
    setLines([])
    await sleep(REDUCED ? 0 : 260)
    if (cancelled(t)) return
    if (!(await typeCmd(t, 'whoami'))) return
    await sleep(90); if (cancelled(t)) return
    push({ kind: 'whoami' })
    await sleep(REDUCED ? 0 : 420); if (cancelled(t)) return
    if (!(await typeCmd(t, 'cat about.txt'))) return
    await sleep(90); if (cancelled(t)) return
    push({ kind: 'about' })
    await sleep(REDUCED ? 0 : 420); if (cancelled(t)) return
    if (!(await typeCmd(t, './links.sh'))) return
    await sleep(REDUCED ? 0 : 180); if (cancelled(t)) return
    push({ kind: 'links' })
    setMode('links')
    bootedThisLoad = true
  }

  /* Esc while links.sh runs: ^C the program, type `clear`, open the shell. */
  async function escToShell() {
    const t = ++tokenRef.current
    setMode('anim')
    push({ kind: 'text', text: '^C', color: 'dim' })
    await sleep(REDUCED ? 0 : 300); if (cancelled(t)) return
    if (!(await typeCmd(t, 'clear'))) return
    await sleep(REDUCED ? 0 : 160); if (cancelled(t)) return
    setLines([])
    setMode('shell')
  }

  /* Esc at the shell: type `clear`, wipe, replay the boot into links.sh. */
  async function escToLinks() {
    const t = ++tokenRef.current
    setMode('anim')
    if (!(await typeCmd(t, 'clear'))) return
    await sleep(REDUCED ? 0 : 160); if (cancelled(t)) return
    await runBoot(t)
  }

  // Boot once per page load; bumping the token on unmount cancels the runner.
  useEffect(() => {
    if (bootedThisLoad) return
    const t = ++tokenRef.current
    runBoot(t)
    // cancel the in-flight boot on unmount (token is a counter, not a DOM node)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { tokenRef.current++ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Esc drives the mode machine (closes overlays first).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      if (confirmLogout) { setConfirmLogout(false); return }
      if (adminPrompt) { setAdminPrompt(null); return }
      if (mode === 'links') escToShell()
      else if (mode === 'shell') escToLinks()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, adminPrompt, confirmLogout])

  // Keep the latest line in view as output streams in.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [lines, adminPrompt, confirmLogout])

  /* ---- interactive shell commands ---- */
  async function flushOut(entries) {
    for (const e of entries) {
      push(e)
      if (!REDUCED) await sleep(26)
    }
  }

  function runCommand(raw) {
    const c = raw.trim()
    setCmd('')
    push({ kind: 'cmd', text: c })
    if (!c) return
    histRef.current.list.push(c)
    histRef.current.i = -1

    if (c === 'help') {
      flushOut([
        { kind: 'text', text: 'available commands:', color: 'fg' },
        { kind: 'text', text: '  whoami              who is this', color: 'dim' },
        { kind: 'text', text: '  cat about.txt       read the about file', color: 'dim' },
        { kind: 'text', text: '  ls                  list files', color: 'dim' },
        { kind: 'text', text: '  ./links.sh          launch the site navigator', color: 'dim' },
        { kind: 'text', text: '  ./admin-login.sh    root login (psk + totp)', color: 'dim' },
        { kind: 'text', text: '  logout              end your user session', color: 'dim' },
        { kind: 'text', text: '  clear               clear the screen', color: 'dim' },
      ])
      return
    }
    if (c === 'whoami') { push({ kind: 'whoami' }); return }
    if (c === 'cat about.txt' || c === 'cat about') { push({ kind: 'about' }); return }
    // `more` is how the note gets read in the show — same reader here
    const readMatch = /^(?:cat|more|less)\s+(.+)$/.exec(c)
    if (readMatch) {
      const f = readMatch[1].trim().replace(/^\.\//, '')
      if (f === 'readme.txt' || f === 'readme') { push({ kind: 'readme' }); return }
      if (f === 'fsociety00.dat') {
        flushOut([
          { kind: 'text', text: 'cat: fsociety00.dat: binary file (aes-256, key not on this machine)', color: 'red' },
          { kind: 'text', text: 'there is a readme.', color: 'dim' },
        ])
        return
      }
    }
    if (c.startsWith('cat ')) {
      const f = c.slice(4).trim()
      push({
        kind: 'text', color: 'red',
        text: f === 'links.sh' || f === 'admin-login.sh' || f === './links.sh' || f === './admin-login.sh'
          ? `cat: ${f.replace(/^\.\//, '')}: permission denied`
          : `cat: ${f}: no such file or directory`,
      })
      return
    }
    if (c === 'ls' || c === 'ls -la' || c === 'ls -l') { push({ kind: 'ls' }); return }
    if (isLinksCommand(c)) {
      push({ kind: 'links' })
      setMode('links')
      return
    }
    if (c === './admin-login.sh' || c === '.\\admin-login.sh' || c === 'admin-login.sh' || c === 'admin-login' || c === 'sh admin-login.sh') {
      setAdminPrompt({ psk: '', totp: '', err: '', busy: false })
      return
    }
    if (c === 'logout') {
      if (user?.email) setConfirmLogout(true)
      else push({ kind: 'text', text: 'not logged in', color: 'dim' })
      return
    }
    if (c === 'clear') { setLines([]); return }
    if (c === 'exit') { push({ kind: 'text', text: 'there is no escape. (well, there is — it relaunches links.sh)', color: 'dim' }); return }
    if (c.startsWith('sudo')) {
      push({ kind: 'text', text: 'austin is not in the sudoers file. this incident will be reported.', color: 'red' })
      return
    }
    // deleting the archive is the one thing the note asks you not to do
    if (/^rm\b/.test(c)) {
      const target = c.replace(/^rm\b\s*(-\S+\s*)*/, '').trim().replace(/^\.\//, '')
      if (target === 'fsociety00.dat' || target === 'readme.txt') {
        push({ kind: 'text', text: `rm: cannot remove '${target}': it asked nicely`, color: 'red' })
        return
      }
      push({ kind: 'text', text: `rm: cannot remove '${target || '...'}': read-only file system`, color: 'red' })
      return
    }
    push({ kind: 'text', text: `command not found: ${c} — try help`, color: 'red' })
  }

  function onInputKey(e) {
    const h = histRef.current
    if (e.key === 'Enter') { runCommand(cmd); return }
    if (e.key === 'ArrowUp') {
      if (h.list.length === 0) return
      e.preventDefault()
      h.i = h.i === -1 ? h.list.length - 1 : Math.max(0, h.i - 1)
      setCmd(h.list[h.i])
    } else if (e.key === 'ArrowDown') {
      if (h.i === -1) return
      e.preventDefault()
      h.i = h.i + 1 >= h.list.length ? -1 : h.i + 1
      setCmd(h.i === -1 ? '' : h.list[h.i])
    }
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
      push({ kind: 'text', text: 'root session active — 12h', color: 'green' })
    } catch (e2) {
      setAdminPrompt({ ...adminPrompt, busy: false, err: e2?.error || 'invalid credentials', psk: '', totp: '' })
    }
  }

  async function doLogout() {
    await logout()
    await refresh()
    setConfirmLogout(false)
    push({ kind: 'text', text: 'logged out', color: 'dim' })
  }

  /* ---- renderers ---- */

  function renderLinksProgram(key) {
    return (
      <div key={key} className="term-out -mx-2">
        <div className="px-2 pb-1.5">
          <p className="text-xs uppercase" style={{ color: 'var(--amber)', letterSpacing: '0.16em' }}>
            <button
              type="button"
              className="links-program-title"
              onClick={mode === 'links' ? escToShell : undefined}
              disabled={mode !== 'links'}
            >
              links.sh
            </button>{' '}
            <span style={{ color: 'var(--dim)', textTransform: 'none', letterSpacing: 0 }}>— site navigator</span>
          </p>
        </div>
        <nav aria-label="Site navigation">
          {links.map((item, i) => {
            const common = mode === 'links' ? rowProps(i) : { className: 'tui-row' }
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
                <a key={item.label} {...common} className={className} href="/"
                  onClick={(e) => { e.preventDefault(); setConfirmLogout(true) }}>
                  {inner}
                </a>
              )
            }
            return item.to ? (
              <a key={item.label} {...common} className={className} href={item.to}
                onClick={(e) => { e.preventDefault(); navigate(item.to) }}>
                {inner}
              </a>
            ) : (
              <a key={item.label} {...common} className={className}
                href={item.href} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            )
          })}
        </nav>
      </div>
    )
  }

  return (
    <Screen max="72rem">
      <Window title="aarg.dev" tag={metrics.fps != null ? `${metrics.fps} fps` : 'session'}>
        {/* two columns: terminal | telemetry */}
        <div className="flex flex-col md:flex-row">
          {/* terminal column */}
          <div
            className="flex-1 min-w-0 px-6 py-6 flex flex-col gap-2"
            style={{ minHeight: '30rem' }}
            onClick={() => { if (mode === 'shell' && window.getSelection()?.isCollapsed) inputRef.current?.focus() }}
          >
            {lines.map((l, i) => {
              if (l.kind === 'cmd') {
                const linksCommand = mode === 'links' && !l.live && isLinksCommand(l.text)
                return (
                  <Prompt
                    key={i}
                    cmd={l.text}
                    cursor={!!l.live}
                    onCommandClick={linksCommand ? escToShell : undefined}
                  />
                )
              }
              if (l.kind === 'text') {
                return (
                  <div key={i} className="term-out text-sm" style={{ color: OUT_COLOR[l.color] || 'var(--fg)', whiteSpace: 'pre-wrap' }}>
                    {l.text}
                  </div>
                )
              }
              if (l.kind === 'whoami') return <WhoamiBlock key={i} />
              if (l.kind === 'about') return <AboutBlock key={i} />
              if (l.kind === 'ls') return <LsBlock key={i} />
              if (l.kind === 'readme') return <ReadmeBlock key={i} />
              if (l.kind === 'links') return renderLinksProgram(i)
              return null
            })}

            {/* inline admin login (PSK + TOTP) — opened by ./admin-login.sh */}
            {adminPrompt && (
              <form onSubmit={submitAdmin} className="term-out mt-1 flex flex-col gap-3" style={{ maxWidth: '24rem' }}>
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

            {confirmLogout && (
              <div className="term-out">
                <Confirm
                  message="log out of your user account? (admin session stays active)"
                  confirmLabel="log out"
                  onConfirm={doLogout}
                  onCancel={() => setConfirmLogout(false)}
                />
              </div>
            )}

            {/* live prompt — only when the shell is interactive */}
            {mode === 'shell' && !adminPrompt && !confirmLogout && (
              <div className="tui-prompt-line">
                <span className="prompt-sign">austin@aarg.dev</span>
                <span style={{ color: 'var(--dim)' }}>:</span>
                <span className="prompt-path">~</span>
                <span style={{ color: 'var(--dim)' }}>$ </span>
                <input
                  ref={inputRef}
                  className="tui-prompt-input"
                  value={cmd}
                  autoFocus
                  placeholder="type a command — try help"
                  onChange={(e) => setCmd(e.target.value)}
                  onKeyDown={onInputKey}
                  autoComplete="off" spellCheck="false"
                />
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* telemetry column — always on, independent of the shell */}
          {/* 26rem: full metric rows need ~353px + padding; below that the
              spark cells shrink (cropping their oldest bars) so the value
              column never spills past the frame on narrow phones */}
          <aside
            className="w-full md:w-[26rem] shrink-0 px-4 sm:px-6 py-6 border-t md:border-t-0 md:border-l"
            style={{ borderColor: 'var(--border)' }}
          >
            <Activity metrics={metrics} />
          </aside>
        </div>

        <hr className="tui-sep" />

        {/* status bar — hints follow the mode */}
        <div className="px-6 py-3 tui-status">
          <StatusDot active={metrics.active} />
          {mode === 'links' && (
            <>
              <span><kbd>↑</kbd>/<kbd>↓</kbd> move</span>
              <span><kbd>⏎</kbd> open</span>
              <span><kbd>esc</kbd> terminal</span>
              <span className="hidden sm:inline"><kbd>j</kbd>/<kbd>k</kbd> vim</span>
            </>
          )}
          {mode === 'shell' && (
            <>
              <span><kbd>⏎</kbd> run</span>
              <span><kbd>↑</kbd>/<kbd>↓</kbd> history</span>
              <span><kbd>esc</kbd> relaunch links.sh</span>
            </>
          )}
          {(mode === 'boot' || mode === 'anim') && <span style={{ opacity: 0.7 }}>…</span>}
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
