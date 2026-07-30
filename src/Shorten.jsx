import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen, Window, Prompt, Field, Button, Notice } from './terminal.jsx'
import { createShortLink } from './api.js'

const LIFETIMES = [
  ['forever', 'forever'], ['1year', '1 year'], ['1month', '1 month'],
  ['1week', '1 week'], ['1day', '1 day'], ['1hour', '1 hour'],
  ['30min', '30 min'], ['10min', '10 min'], ['1min', '1 min'],
  ['single', 'single use'],
]

export default function Shorten() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [path, setPath] = useState('')
  const [lifetime, setLifetime] = useState('forever')
  const [created, setCreated] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  async function submit(e) {
    e?.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setCreated(null)
    try {
      setCreated(await createShortLink(url, path.trim(), lifetime))
      setUrl('')
      setPath('')
    } catch (err) {
      setError(err?.error || 'could not create short url')
    } finally {
      setBusy(false)
    }
  }

  async function copy(which) {
    const relative = which === 'short' ? created.url : created.unambiguous_url
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${relative}`)
      setCopied(which)
      setTimeout(() => setCopied(''), 1500)
    } catch { setError('could not copy url') }
  }

  return (
    <Screen align="top" max="50rem">
      <Window title="aarg.dev / short" tag="public">
        <div className="px-6 pt-7 pb-4"><Prompt cmd="shorten --new" cursor /></div>
        <hr className="tui-sep" />
        <form onSubmit={submit} className="px-6 py-6 flex flex-col gap-4">
          <Field label="destination url" value={url} onChange={setUrl}
            placeholder="https://example.com/a/long/url" onEnter={submit} autoFocus />
          <Field label="custom path (optional — blank = generated 4 characters)"
            value={path} onChange={setPath} placeholder="e.g. docs" onEnter={submit} />
          <label className="tui-field">
            <span className="tui-field-label">survival length</span>
            <select className="tui-input" value={lifetime} onChange={(e) => setLifetime(e.target.value)}>
              {LIFETIMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            <Button type="submit" disabled={busy || !url.trim()}>
              {busy ? 'creating…' : 'create short url'}
            </Button>
            <span className="text-xs" style={{ color: 'var(--dim)' }}>no account required</span>
          </div>
          <Notice kind="error">{error}</Notice>
        </form>

        {created && (
          <div className="px-6 pb-6 flex flex-col gap-3">
            <hr className="tui-sep" />
            <div className="pt-4 flex flex-col gap-3">
              <Notice kind="ok">short url created{created.single_use ? ' — it will survive one successful read' : ''}.</Notice>
              <a href={created.url} className="tui-input" style={{ textDecoration: 'none', wordBreak: 'break-all' }}>
                {window.location.origin}{created.url}
              </a>
              <div className="flex gap-3 flex-wrap">
                <Button onClick={() => copy('short')}>{copied === 'short' ? 'copied!' : 'copy short url'}</Button>
                <Button onClick={() => copy('safe')}>{copied === 'safe' ? 'copied!' : 'copy /s/ url'}</Button>
              </div>
              <p className="text-xs" style={{ color: 'var(--dim)' }}>
                unambiguous form: {window.location.origin}{created.unambiguous_url}
              </p>
            </div>
          </div>
        )}

        <hr className="tui-sep" />
        <div className="px-6 py-3 tui-status">
          <Link to="/" onClick={(e) => { e.preventDefault(); navigate('/') }} style={{ color: 'var(--amber)' }}>
            ‹ ../ home
          </Link>
        </div>
      </Window>
    </Screen>
  )
}
