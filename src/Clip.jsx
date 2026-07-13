import { useState, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation, Link } from 'react-router-dom'
import { Screen, Window, Prompt, Field, TextArea, Button, Notice } from './terminal.jsx'
import { useAuth } from './auth.js'
import { createClip, uploadClipFile, deleteClip } from './api.js'
import { fmtSize } from './format.js'

const FILE_MAX_BYTES = 5 * 1024 * 1024

/* Create a clip. Guards: not logged in → redirect /login?next=/clip;
 * not whitelisted → red notice. Custom path (blank = generated short url,
 * pre-filled from ?path= when arriving via "make clip for this path"),
 * content textarea, create button. On success shows the /clip/<path> link,
 * a copy-URL button, and the expiry. */
export default function Clip() {
  const navigate = useNavigate()
  const routeLocation = useLocation()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const replacePath = params.get('replace') || ''
  const replacing = !!replacePath

  const [path, setPath] = useState(() => replacePath || params.get('path') || '')
  const [content, setContent] = useState('')
  const [file, setFile] = useState(null)         // File to attach, or null
  const [err, setErr] = useState('')
  const [fileErr, setFileErr] = useState('')     // upload failed but clip exists
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState(null)   // { path, url, expires_at, file? }
  const [copied, setCopied] = useState(false)
  const fileInput = useRef(null)

  if (user === null) {
    // still loading? user is null only before first /me resolves OR when guest.
    // AuthProvider sets loading:false then user stays null for guests.
  }

  // Guest → redirect to login.
  if (user !== null && !user.email) {
    navigate(`/login?next=${encodeURIComponent(routeLocation.pathname + routeLocation.search)}`, { replace: true })
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

  function pickFile(f) {
    setErr('')
    if (!f) { setFile(null); return }
    if (f.size > FILE_MAX_BYTES) {
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      setErr(`file too large (${fmtSize(f.size)}) — 5 MB max`)
      return
    }
    setFile(f)
  }

  async function submit(e) {
    e?.preventDefault()
    if (busy) return
    setErr('')
    setFileErr('')
    setCreated(null)
    setBusy(true)
    try {
      const res = await createClip(path.trim().toLowerCase(), content, !!file, replacing)
      if (file) {
        try {
          res.file = await uploadClipFile(res.path, file)
        } catch (e2) {
          // Clip + attachment is all-or-nothing: roll the clip back and keep
          // the form filled so the user can retry.
          try {
            await deleteClip(res.path)
            setErr(`file upload failed — clip not created: ${e2?.error || 'error'}`)
            return
          } catch {
            // rollback failed; the clip exists without its file — say so
            setFileErr(e2?.error || 'file upload failed')
          }
        }
      }
      setCreated(res)
      setContent('')
      if (!replacing) setPath('')
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
    } catch (e2) {
      setErr(e2?.error || 'could not create clip')
    } finally {
      setBusy(false)
    }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${created.url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { setErr('could not copy') }
  }

  return (
    <Screen align="top" max="48rem">
      <Window title="aarg.dev / clip" tag="ephemeral · 24h">
        <div className="px-6 pt-7 pb-4"><Prompt cmd={replacing ? `clip --replace ${replacePath}` : 'clip --new'} cursor /></div>
        <hr className="tui-sep" />

        <form onSubmit={submit} className="px-6 py-6 flex flex-col gap-4">
          {replacing && (
            <Notice kind="error">
              the existing /{replacePath} clip stays live until you submit this replacement.
            </Notice>
          )}
          <Field
            label={replacing ? 'path (locked for replacement)' : 'path (optional — blank = generated short code)'}
            value={path} onChange={setPath} placeholder="e.g. notes"
            onEnter={submit} disabled={replacing}
          />
          <TextArea
            label={`content${file ? ' (optional — file attached)' : ''}`}
            value={content} onChange={setContent}
            rows={8} placeholder="paste anything… (max 200 KB)"
          />

          <div className="tui-field">
            <span className="tui-field-label">attachment (optional — max 5 MB)</span>
            <input
              ref={fileInput} type="file" className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] || null)}
            />
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => fileInput.current?.click()}>
                {file ? 'change file' : 'attach file'}
              </Button>
              {file && (
                <>
                  <span className="text-xs" style={{ color: 'var(--fg)', wordBreak: 'break-all' }}>
                    {file.name} <span style={{ color: 'var(--dim)' }}>({fmtSize(file.size)})</span>
                  </span>
                  <Button onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = '' }}>
                    ✕ remove
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={submit}
              variant={replacing ? 'danger' : ''}
              disabled={busy || (!content && !file)}
            >
              {replacing ? 'erase old clip and replace' : 'create clip'}
            </Button>
            <span className="text-xs" style={{ color: 'var(--dim)' }}>expires in 24h</span>
          </div>

          <Notice kind="error">{err}</Notice>
        </form>

        {created && (
          <div className="px-6 pb-6 flex flex-col gap-3">
            <hr className="tui-sep" />
            <div className="pt-4">
              <Notice kind="ok">
                clip {created.replaced ? 'replaced' : 'created'}{created.file ? ` with attachment ${created.file.name} (${fmtSize(created.file.size)})` : ''}
                {' '}— share the link, log in to read it from anywhere.
              </Notice>
              <Notice kind="error">{fileErr && `clip created, but the file didn't upload: ${fileErr}`}</Notice>
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
