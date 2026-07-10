import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Screen, Window, Prompt, Field, Button, Notice, Confirm } from './terminal.jsx'
import { useAuth } from './auth.js'
import {
  adminLogin, adminLogout,
  listWhitelist, addWhitelist, removeWhitelist,
  adminListClips, adminDeleteClip,
} from './api.js'

/* Unlisted route (typed directly, or reached via the home command prompt).
 * Not admin → PSK + 6-digit TOTP form. Admin → red-accented sections
 * (whitelist + live clips) with danger buttons, plus admin-logout. */
export default function Admin() {
  const navigate = useNavigate()
  const { user, refresh } = useAuth()

  if (!user) {
    // still resolving / guest → show the login form (it'll gate on server-side 401 anyway)
  }

  if (user && !user.admin) return <AdminLogin refresh={refresh} navigate={navigate} />
  if (!user || !user.admin) return null
  return <AdminConsole user={user} refresh={refresh} navigate={navigate} />
}

/* ---------------- admin login (PSK + TOTP) ---------------- */
function AdminLogin({ refresh, navigate }) {
  const [psk, setPsk] = useState('')
  const [totp, setTotp] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e?.preventDefault()
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      await adminLogin(psk, totp)
      await refresh()
    } catch (e2) {
      setErr(e2?.error || 'invalid credentials')
    } finally {
      setBusy(false)
      setPsk(''); setTotp('')
    }
  }

  return (
    <Screen align="top" max="42rem">
      <Window title="aarg.dev / admin" tag="root · locked">
        <div className="px-6 pt-7 pb-4"><Prompt cmd="su - root" cursor /></div>
        <hr className="tui-sep" />
        <form onSubmit={submit} className="px-6 py-6 flex flex-col gap-4">
          <Field
            label="admin psk (pre-shared key)" type="password" value={psk}
            autoFocus autoComplete="off" onChange={setPsk} onEnter={submit}
            placeholder="••••••••"
          />
          <Field
            label="totp code (6 digits)" value={totp}
            onChange={(v) => setTotp(v.replace(/\D/g, '').slice(0, 6))}
            onEnter={submit} placeholder="000000" autoComplete="one-time-code"
          />
          <div className="flex items-center gap-3">
            <Button onClick={submit} disabled={busy || !psk || totp.length !== 6}>
              {busy ? '…' : 'authenticate'}
            </Button>
            <span className="text-xs" style={{ color: 'var(--dim)' }}>psk + totp required</span>
          </div>
          <Notice kind="error">{err}</Notice>
        </form>
        <hr className="tui-sep" />
        <BackRow navigate={navigate} />
      </Window>
    </Screen>
  )
}

/* ---------------- admin console ---------------- */
function AdminConsole({ user, refresh, navigate }) {
  const [section, setSection] = useState('whitelist') // 'whitelist' | 'clips'
  const [wl, setWl] = useState([])
  const [clips, setClips] = useState([])
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [w, c] = await Promise.all([listWhitelist(), adminListClips()])
      setWl(w); setClips(c)
    } catch (e) { setErr(e?.error || 'failed to load') }
  }, [])

  // Load whitelist + clips once on mount; setState happens after await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function doLogout() {
    await adminLogout()
    await refresh()
    navigate('/')
  }

  const [confirmLogout, setConfirmLogout] = useState(false)

  return (
    <Screen align="top" max="56rem">
      <Window title="aarg.dev / admin" tag="root">
        <div className="px-6 pt-7 pb-4">
          <Prompt cmd="admin-console" cursor />
          <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>
            root session · {user.email || 'anonymous'} · 12h
          </p>
        </div>
        <hr className="tui-sep" />

        <div className="flex">
          <SectionTab active={section === 'whitelist'} onClick={() => setSection('whitelist')} label="whitelist" />
          <SectionTab active={section === 'clips'} onClick={() => setSection('clips')} label="clips" />
        </div>
        <hr className="tui-sep" />

        <div className="px-6 py-6">
          <Notice kind="error">{err}</Notice>
          {section === 'whitelist'
            ? <WhitelistSection wl={wl} reload={load} />
            : <ClipsSection clips={clips} reload={load} />}
        </div>

        <hr className="tui-sep" />

        <div className="px-6 py-4">
          {confirmLogout ? (
            <Confirm
              message="drop admin session? (user login stays active)"
              confirmLabel="admin logout"
              variant="danger"
              onConfirm={doLogout}
              onCancel={() => setConfirmLogout(false)}
            />
          ) : (
            <Button variant="danger" onClick={() => setConfirmLogout(true)}>admin logout</Button>
          )}
        </div>

        <hr className="tui-sep" />
        <BackRow navigate={navigate} />
      </Window>
    </Screen>
  )
}

function SectionTab({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 text-xs"
      style={{ color: active ? 'var(--red)' : 'var(--dim)', borderBottom: active ? '1px solid var(--red)' : '1px solid transparent' }}
    >
      {label}
    </button>
  )
}

/* ---------------- whitelist section ---------------- */
function WhitelistSection({ wl, reload }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')

  async function add(e) {
    e?.preventDefault()
    if (!email) return
    setMsg('')
    try {
      await addWhitelist(email.trim().toLowerCase())
      setEmail('')
      await reload()
    } catch (e2) { setMsg(e2?.error || 'failed') }
  }

  async function remove(addr) {
    try {
      await removeWhitelist(addr)
      await reload()
    } catch (e2) { setMsg(e2?.error || 'failed') }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex items-center gap-3 flex-wrap">
        <Field value={email} onChange={setEmail} placeholder="email to whitelist" onEnter={add} />
        <Button onClick={add} disabled={!email}>add</Button>
      </form>
      {msg && <Notice kind="error">{msg}</Notice>}

      <div className="flex flex-col">
        {wl.length === 0 && <p className="text-xs" style={{ color: 'var(--dim)' }}>no whitelisted users.</p>}
        {wl.map((row) => (
          <div key={row.email} className="flex items-center gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--fg)' }}>{row.email}</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--dim)' }}>{new Date(row.added_at).toLocaleDateString()}</span>
            <Button variant="danger" onClick={() => remove(row.email)}>remove</Button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- clips section ---------------- */
function ClipsSection({ clips, reload }) {
  const [msg, setMsg] = useState('')

  async function del(path) {
    try {
      await adminDeleteClip(path)
      await reload()
    } catch (e2) { setMsg(e2?.error || 'failed') }
  }

  return (
    <div className="flex flex-col gap-3">
      {msg && <Notice kind="error">{msg}</Notice>}
      {clips.length === 0 && <p className="text-xs" style={{ color: 'var(--dim)' }}>no live clips.</p>}
      {clips.map((c) => (
        <div key={c.path} className="flex items-center gap-3 py-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
          <Link to={`/clip/${c.path}`} style={{ color: 'var(--cyan)' }}>/{c.path}</Link>
          <span className="text-xs" style={{ color: 'var(--dim)' }}>by {c.created_by}</span>
          <span className="text-xs ml-auto" style={{ color: 'var(--dim)' }}>
            expires {new Date(c.expires_at).toLocaleString()}
          </span>
          <Button variant="danger" onClick={() => del(c.path)}>delete</Button>
        </div>
      ))}
    </div>
  )
}

function BackRow({ navigate }) {
  return (
    <div className="px-6 py-3 tui-status">
      <Link to="/" onClick={(e) => { e.preventDefault(); navigate('/') }} style={{ color: 'var(--amber)' }}>
        ‹ ../ home
      </Link>
    </div>
  )
}
