import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Screen, Window, Prompt, Button, Notice } from './terminal.jsx'
import { getClip } from './api.js'

/* Read a clip by path. 401 → /login?next=/clip/<path>; 403 → not-whitelisted
 * notice; 404 → "no such clip (or it expired)". Content in a read-only <pre>
 * styled like tui-input; header with path + expires-in; copy button. */
export default function ClipView() {
  const { path } = useParams()
  const navigate = useNavigate()
  const [clip, setClip] = useState(null)
  const [err, setErr] = useState('')
  const [status, setStatus] = useState('loading') // loading | ok | login | denied | unauthorized | missing
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('loading')
    getClip(path).then((c) => { if (alive) { setClip(c); setStatus('ok') } })
      .catch((e) => {
        if (!alive) return
        if (e.status === 401) setStatus('login')
        else if (e.status === 403 && e.error === 'forbidden') setStatus('denied')
        else if (e.status === 403) setStatus('unauthorized')
        else { setStatus('missing'); setErr(e.error || 'no such clip') }
      })
    return () => { alive = false }
  }, [path])

  async function copy() {
    try {
      await navigator.clipboard.writeText(clip?.content || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  const title = `aarg.dev / clip / ${path}`

  return (
    <Screen align="top" max="52rem">
      <Window title={title} tag={status === 'ok' ? 'live' : status}>
        <div className="px-6 pt-7 pb-4">
          <Prompt path="~/clip" cmd={`cat ${path}`} cursor />
        </div>
        <hr className="tui-sep" />

        {status === 'loading' && (
          <div className="px-6 py-10"><p style={{ color: 'var(--dim)' }}>reading…</p></div>
        )}

        {status === 'login' && (
          <div className="px-6 py-10 flex flex-col gap-4">
            <Notice kind="error">login required to read clips.</Notice>
            <Button onClick={() => navigate(`/login?next=/clip/${path}`)}>log in</Button>
          </div>
        )}

        {status === 'denied' && (
          <div className="px-6 py-10">
            <Notice kind="error">your account is not whitelisted for clips.</Notice>
            <p className="text-xs mt-3" style={{ color: 'var(--dim)' }}>ask the site admin to whitelist you.</p>
          </div>
        )}

        {status === 'unauthorized' && (
          <div className="px-6 py-10">
            <Notice kind="error">unauthorized — this clip belongs to another user.</Notice>
          </div>
        )}

        {status === 'missing' && (
          <div className="px-6 py-10"><Notice kind="error">{err || 'no such clip (or it expired)'}</Notice></div>
        )}

        {status === 'ok' && clip && (
          <div className="px-6 py-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap text-xs" style={{ color: 'var(--dim)' }}>
              <span>path: <span style={{ color: 'var(--fg)' }}>/{clip.path}</span></span>
              <span>·</span>
              <span>expires in {expiresIn(clip.expires_at)}</span>
            </div>
            <pre className="tui-input" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto' }}>
{clip.content}
            </pre>
            <Button onClick={copy}>{copied ? 'copied!' : 'copy content'}</Button>
          </div>
        )}

        <hr className="tui-sep" />
        <div className="px-6 py-3 tui-status">
          <Link to="/clip" onClick={(e) => { e.preventDefault(); navigate('/clip') }} style={{ color: 'var(--amber)' }}>
            ‹ new clip
          </Link>
          <Link to="/" onClick={(e) => { e.preventDefault(); navigate('/') }} style={{ color: 'var(--dim)', marginLeft: 'auto' }}>
            ../ home
          </Link>
        </div>
      </Window>
    </Screen>
  )
}

function expiresIn(exp) {
  const ms = exp - Date.now()
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
