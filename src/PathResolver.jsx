import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Screen, Window, Prompt, Button, Notice } from './terminal.jsx'
import { getShortLink } from './api.js'
import ClipView from './ClipView.jsx'

/* Named routes are matched before this component. Other root paths resolve
 * short link -> clip -> missing; /s/:path is short-link-only. */
export default function PathResolver({ shortOnly = false }) {
  const { path } = useParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const requested = useRef('')

  useEffect(() => {
    const key = `${shortOnly}:${path}`
    // React StrictMode replays effects in development. A single-use link must
    // still be resolved exactly once, so deduplicate that replay.
    if (requested.current === key) return
    requested.current = key
    setStatus('loading')
    getShortLink(path)
      .then((link) => {
        if (requested.current === key) window.location.replace(link.target_url)
      })
      .catch((error) => {
        if (requested.current === key) setStatus(error.status === 404 ? (shortOnly ? 'missing' : 'clip') : 'error')
      })
  }, [path, shortOnly])

  if (status === 'clip') return <ClipView fallbackMissing />

  return (
    <Screen align="top" max="48rem">
      <Window title={`aarg.dev / ${shortOnly ? 's / ' : ''}${path}`} tag={status}>
        <div className="px-6 pt-7 pb-4">
          <Prompt cmd={`resolve ${shortOnly ? `/s/${path}` : `/${path}`}`} cursor={status === 'loading'} />
        </div>
        <hr className="tui-sep" />
        <div className="px-6 py-10 flex flex-col gap-4">
          {status === 'loading' && <p style={{ color: 'var(--dim)' }}>resolving…</p>}
          {status === 'missing' && <Notice kind="error">there is no page for this url.</Notice>}
          {status === 'error' && <Notice kind="error">the url could not be resolved. try again shortly.</Notice>}
          {status !== 'loading' && (
            <div className="flex items-center gap-3">
              <Button onClick={() => navigate('/short')}>create short url</Button>
              <Link to="/" style={{ color: 'var(--dim)' }}>../ home</Link>
            </div>
          )}
        </div>
      </Window>
    </Screen>
  )
}
