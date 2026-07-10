import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Screen, Window, Prompt, Field, Button, Notice } from './terminal.jsx'
import { useAuth } from './auth.js'
import { login, signup } from './api.js'

/* Login ↔ signup toggle. Honors ?next= for post-login redirect.
 * Layout cloned from Blog.jsx (Screen→Window→Prompt). */
export default function Login() {
  const navigate = useNavigate()
  const { refresh } = useAuth()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'

  const [mode, setMode] = useState('login')        // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function toggleMode() { setErr(''); setMode((m) => m === 'login' ? 'signup' : 'login') }

  async function submit(e) {
    e?.preventDefault()
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      if (mode === 'signup') await signup(email, password)
      else await login(email, password)
      await refresh()
      navigate(next, { replace: true })
    } catch (e2) {
      setErr(e2?.error || 'something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen align="top" max="40rem">
      <Window title={`aarg.dev / ${mode}`} tag={mode === 'signup' ? 'new account' : 'session'}>
        <div className="px-6 pt-7 pb-4">
          <Prompt cmd={mode === 'signup' ? 'create-account' : 'login'} cursor />
        </div>

        <hr className="tui-sep" />

        <form onSubmit={submit} className="px-6 py-6 flex flex-col gap-4">
          <Field
            label="email" type="email" name="email" value={email}
            autoFocus placeholder="you@example.com"
            autoComplete="email" onChange={setEmail}
          />
          <Field
            label="password" type="password" name="password" value={password}
            placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            onChange={setPassword} onEnter={submit}
          />

          <div className="flex items-center gap-3">
            <Button onClick={submit} disabled={busy || !email || !password}>
              {busy ? '…' : mode === 'signup' ? 'create account' : 'log in'}
            </Button>
            <button
              type="button"
              className="text-xs"
              style={{ color: 'var(--dim)' }}
              onClick={toggleMode}
            >
              {mode === 'login' ? 'no account? sign up' : 'have an account? log in'}
            </button>
          </div>

          <Notice kind="error">{err}</Notice>
        </form>

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
