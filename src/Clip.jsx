import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Screen, Window, Prompt, Field, TextArea, Button, Notice } from './terminal.jsx'
import { useAuth } from './auth.js'
import { createClip } from './api.js'

/* Create a clip. Guards: not logged in → redirect /login?next=/clip;
 * not whitelisted → red notice. Custom path (blank = generated short url,
 * pre-filled from ?path= when arriving via "make clip for this path"),
 * content textarea, create button. On success shows the /clip/<path> link,
 * a copy-URL button, and the expiry. */
export default function Clip() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [params] = useSearchParams()

  const [path, setPath] = useState(() => params.get('path') || '')
  const [content, setContent] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)   // { path, url, expires_at }
  const [copied, setCopied] = useState(false)

  if (user === null) {
    // still loading? user is null only before first /me resolves OR when guest.
    // AuthProvider sets loading:false then user stays null for guests.
  }

  // Guest → redirect to login.
  if (user !== null && !user.email) {
    navigate('/login?next=/clip', { replace: true })
    return null
  }
  if (user && user.email && !user.whitelisted) {
    return (
      <Screen align="top" max="48rem">
        <Window title="aarg.dev / clip" tag="denied">
          <div className="px-6 pt-7 pb-4"><Prompt cmd="clip --create" cursor /></div>
          <hr className="tui-sep" />
          <div className="px-6 py-8">
            <Notice kind="error">your account is not whitelisted for clips.</Notice>
            <p className="text-xs mt-3" style={{ color: 'var(--dim)' }}>
              ask the site admin to add <span style={{ color: 'var(--fg)' }}>{user.email}</span> to the whitelist.
            </p>
          </div>
          <hr className="tui-sep" />
          <BackRow navigate={navigate} />
        </Window>
      </Screen>
    )
  }
  if (!user) return null // loading

  async function submit(e) {
    e?.preventDefault()
    if (busy) return
    setErr('')
    setCreated(null)
    setBusy(true)
    try {
      const res = await createClip(path.trim().toLowerCase(), content)
      setCreated(res)
      setContent('')
      setPath('')
    } catch (e2) {
      setErr(e2?.error || 'could not create clip')
    } finally {
      setBusy(false)
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${created.url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { setErr('could not copy') }
  }

  return (
    <Screen align="top" max="48rem">
      <Window title="aarg.dev / clip" tag="ephemeral · 24h">
        <div className="px-6 pt-7 pb-4"><Prompt cmd="clip --new" cursor /></div>
        <hr className="tui-sep" />

        <form onSubmit={submit} className="px-6 py-6 flex flex-col gap-4">
          <Field
            label="path (optional — blank = generated short code)"
            value={path} onChange={setPath} placeholder="e.g. notes"
            onEnter={submit}
          />
          <TextArea
            label="content" value={content} onChange={setContent}
            rows={8} placeholder="paste anything… (max 200 KB)"
          />

          <div className="flex items-center gap-3">
            <Button onClick={submit} disabled={busy || !content}>create clip</Button>
            <span className="text-xs" style={{ color: 'var(--dim)' }}>expires in 24h</span>
          </div>

          <Notice kind="error">{err}</Notice>
        </form>

        {created && (
          <div className="px-6 pb-6 flex flex-col gap-3">
            <hr className="tui-sep" />
            <div className="pt-4">
              <Notice kind="ok">clip created — share the link, log in to read it from anywhere.</Notice>
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <Link
                  to={created.url}
                  onClick={(e) => { e.preventDefault(); navigate(created.url) }}
                  className="tui-input"
                  style={{ maxWidth: 'max-content', textDecoration: 'none', cursor: 'pointer' }}
                >
                  {created.url}
                </Link>
                <Button onClick={copyUrl}>{copied ? 'copied!' : 'copy url'}</Button>
              </div>
            </div>
          </div>
        )}

        <hr className="tui-sep" />
        <BackRow navigate={navigate} />
      </Window>
    </Screen>
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
