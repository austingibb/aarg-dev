import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { Screen, Window, Prompt, Button, Notice } from './terminal.jsx'
import { getClip, clipFileUrl } from './api.js'
import { fmtSize } from './format.js'

/* Read a clip by path. Visitors without access get a neutral route back home;
 * 404 shows "no such clip (or it expired)" + a button to create a clip at this
 * path. Content is rendered read-only with copy/download/follow controls. */
export default function ClipView() {
  const { path } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const fromAdmin = location.state?.from === 'admin'
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
  const noAccess = status === 'login' || status === 'denied' || status === 'unauthorized'

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

        {noAccess && (
          <div className="px-6 py-10 flex flex-col gap-4">
            <Notice kind="error">
              whoops — you don't have permission to view this part of the website. you may have meant to view the main page: aarg.dev
            </Notice>
            <Button onClick={() => navigate('/')}>return to aarg.dev</Button>
          </div>
        )}

        {status === 'missing' && (
          <div className="px-6 py-10 flex flex-col gap-4">
            <Notice kind="error">{err || 'no such clip (or it expired)'}</Notice>
            <Button onClick={() => navigate(`/clip?path=${encodeURIComponent(path)}`)}>
              make clip for this path
            </Button>
          </div>
        )}

        {status === 'ok' && clip && (
          <div className="px-6 py-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 flex-wrap text-xs" style={{ color: 'var(--dim)' }}>
              <span>path: <span style={{ color: 'var(--fg)' }}>/{clip.path}</span></span>
              <span>·</span>
              <span>expires in {expiresIn(clip.expires_at)}</span>
            </div>
            {clip.content ? (
              <pre className="tui-input" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowX: 'auto' }}>
{clip.content}
              </pre>
            ) : (
              <p className="text-xs" style={{ color: 'var(--dim)' }}>(no text — file-only clip)</p>
            )}
            {clip.file && (
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <span style={{ color: 'var(--dim)' }}>attachment:</span>
                <span style={{ color: 'var(--fg)', wordBreak: 'break-all' }}>
                  {clip.file.name} <span style={{ color: 'var(--dim)' }}>({fmtSize(clip.file.size)})</span>
                </span>
                {/* Plain same-origin navigation: cookie rides along, and the
                    Content-Disposition: attachment response downloads without
                    leaving the page. */}
                <Button onClick={() => { window.location.href = clipFileUrl(clip.path) }}>
                  ↓ download
                </Button>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              {clip.content && <Button onClick={copy}>{copied ? 'copied!' : 'copy content'}</Button>}
              {clipUrl(clip.content) && (
                <Button onClick={() => window.open(clipUrl(clip.content), '_blank', 'noopener,noreferrer')}>
                  follow clip url ↗
                </Button>
              )}
              <Button
                variant="danger"
                onClick={() => navigate(`/clip?replace=${encodeURIComponent(clip.path)}`)}
              >
                replace this clip with new clip
              </Button>
            </div>
          </div>
        )}

        <hr className="tui-sep" />
        <div className="px-6 py-3 tui-status">
          {!noAccess && (fromAdmin ? (
            <Link to="/admin" onClick={(e) => { e.preventDefault(); navigate('/admin', { state: { section: 'clips' } }) }} style={{ color: 'var(--red)' }}>
              ‹ admin console
            </Link>
          ) : (
            <Link to="/clip" onClick={(e) => { e.preventDefault(); navigate('/clip') }} style={{ color: 'var(--amber)' }}>
              ‹ new clip
            </Link>
          ))}
          <Link to="/" onClick={(e) => { e.preventDefault(); navigate('/') }} style={{ color: 'var(--dim)', marginLeft: 'auto' }}>
            {noAccess ? 'aarg.dev' : '../ home'}
          </Link>
        </div>
      </Window>
    </Screen>
  )
}

/* If the clip content is exactly one http(s) URL, return its href; else null. */
function clipUrl(content) {
  const t = (content || '').trim()
  if (!t || /\s/.test(t)) return null
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch { return null }
}

function expiresIn(exp) {
  const ms = exp - Date.now()
  if (ms <= 0) return 'expired'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
