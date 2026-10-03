import { useCallback, useEffect, useRef, useState } from 'react'
import { getRewardStatus, unlockReward, claimReward, acknowledgeReward } from './api.js'
import './reward.css'

const OFFERS = [
  ['EXCLUSIVE OFFER', 'You opened a battery tray.', 'Most people never make it this far.'],
  ['FREE SHIPPING', 'Delivered directly to your eyeballs.', 'Handling fee: one unusually long word.'],
  ['TRUST US*', 'Definitely a website.', '*Independently verified by this website.'],
]

export default function Reward({ slug }) {
  const [screen, setScreen] = useState({ state: 'loading' })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [dismissed, setDismissed] = useState([])
  const [popup, setPopup] = useState(true)
  const [remaining, setRemaining] = useState(0)
  const deadline = useRef(0)
  const request = useRef(0)
  const alive = useRef(true)

  const apply = useCallback((data) => {
    deadline.current = data.expires_at ? Date.now() + Math.max(0, data.expires_at - data.server_now) : 0
    setRemaining(deadline.current ? Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)) : 0)
    setScreen(data)
    setCopied(false)
  }, [])

  const refresh = useCallback(async () => {
    const id = ++request.current
    try {
      const data = await getRewardStatus(slug)
      if (alive.current && id === request.current) { apply(data); setError('') }
    } catch {
      if (alive.current && id === request.current) setError('The prize department is temporarily unreachable. Try again.')
    }
  }, [slug, apply])

  const cancel = useCallback(() => { alive.current = false; request.current++ }, [])
  useEffect(() => {
    alive.current = true
    // Like AuthProvider: state changes only after the network request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
    return cancel
  }, [refresh, cancel])

  useEffect(() => {
    const tick = () => {
      if (!deadline.current) return
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000))
      setRemaining(seconds)
      if (!seconds) {
        request.current++
        deadline.current = 0
        setScreen({ state: 'consolation' })
        setCopied(false)
      }
    }
    const interval = setInterval(tick, 250)
    // On hiding/navigation, discard the phrase. Restoring requires server validation.
    const hide = () => {
      request.current++
      setScreen((old) => old.phrase ? { ...old, phrase: undefined } : old)
      setCopied(false)
      setBusy(false)
    }
    const visible = () => {
      if (document.hidden) hide()
      else { tick(); refresh() }
    }
    const pageshow = (event) => { if (event.persisted) { tick(); refresh() } }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('pagehide', hide)
    window.addEventListener('pageshow', pageshow)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('pagehide', hide)
      window.removeEventListener('pageshow', pageshow)
    }
  }, [refresh])

  async function act(action) {
    if (busy) return
    const id = ++request.current
    setBusy(true); setError('')
    try {
      const data = await action()
      if (alive.current && id === request.current) apply(data)
    } catch (e) {
      if (alive.current && id === request.current) setError(e.error || 'Something went sideways. Your winning browser can retry within the original hour.')
    } finally {
      if (alive.current && id === request.current) setBusy(false)
    }
  }

  async function copy() {
    const phrase = screen.phrase
    if (!phrase || Date.now() >= deadline.current) return
    try { await navigator.clipboard.writeText(phrase); setCopied(true) }
    catch { setError('Copy was blocked. Select the phrase and copy it manually.') }
  }

  const unlocked = screen.state === 'available' || screen.state === 'winner'
  const finished = screen.state === 'consolation' || screen.state === 'saved'
  return (
    <main className="reward-world">
      <div className="reward-ticker"><span>VERY WOW • SMALL PRINT, HUGE DOGE • BATTERIES NOT INCLUDED • VERY WOW • SMALL PRINT, HUGE DOGE •</span></div>
      <header className="reward-header">
        <a href="/" className="reward-brand">INSIDE<span>™</span><small>the deals were inside all along</small></a>
        <span className="reward-alpha">ALPHA DEMO · NO REAL FUNDS</span>
      </header>
      <div className="reward-strip">★ CERTIFIED BATTERY TRAY EXCLUSIVE ★ NO PURCHASE NECESSARY ★</div>

      <section className="reward-stage" aria-label="Curiosity reward">
        {unlocked && <div className="reward-confetti" aria-hidden="true">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--piece': i }} />)}</div>}
        <div className="reward-sticker">100%<small>UNEXPECTED</small></div>
        <div className="reward-coin" aria-hidden="true">Ð</div>
        <p className="reward-eyebrow">What can be known? Apparently, this.</p>
        <h1>{finished ? 'OH NO. MUCH LATE.' : screen.state === 'winner' ? 'MUCH WIN. SUCH YOU.' : 'YOU LOOKED INSIDE?!'}</h1>
        <p className="reward-subtitle">Some ideas are best kept inside. This one escaped marketing.</p>

        {screen.state === 'loading' && <div className="reward-card"><p role="status">Contacting the department of improbable prizes…</p><button onClick={refresh}>Try again</button></div>}

        {screen.state === 'locked' && <form className="reward-card" onSubmit={(event) => { event.preventDefault(); act(() => unlockReward(slug, password)); setPassword('') }}>
          <span className="reward-label">YOUR EXTREMELY EXCLUSIVE ACCESS CODE</span>
          <h2>The battery knows.</h2>
          <p>Enter the word from the battery tray. You have earned the right to be suspicious.</p>
          <label htmlFor="reward-password">Secret word</label>
          <input id="reward-password" type="password" value={password} maxLength={128} autoComplete="off" spellCheck={false} onChange={(event) => setPassword(event.target.value)} required />
          <button className="reward-cta" disabled={busy || !password}>{busy ? 'CONSULTING THE BATTERY…' : 'UNLOCK QUESTIONABLE DEALS →'}</button>
          <small>No account. No email. Just an impressive commitment to opening things.</small>
        </form>}

        {unlocked && <>
          <div className="reward-price"><s>0 DOGE</s><strong>256 DOGE</strong><span>FOR THE LOW PRICE OF CURIOSITY*</span></div>
          <div className="reward-card reward-prize">
            {screen.state === 'available' ? <>
              <span className="reward-label">ONE PRIZE. ONE VERY CURIOUS PERSON.</span>
              <h2>Congratulations, battery inspector.</h2>
              <p>Your qualifications have been reviewed by absolutely nobody.</p>
              <button className="reward-cta" disabled={busy} onClick={() => act(() => claimReward(slug))}>{busy ? 'CHECKING THE PRIZE VAULT…' : 'CLAIM YOUR 256 DOGE'}</button>
              <p className="reward-fine">*Alpha test: you will receive a fake phrase, not cryptocurrency. First successful claim wins. Keep this browser’s cookies to return within one hour.</p>
            </> : <>
              <span className="reward-label">RESERVED FOR THIS BROWSER</span>
              <h2>You won the alpha prize!</h2>
              <p className="reward-timer">Recovery time remaining: <strong>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</strong></p>
              {screen.phrase ? <>
                <label htmlFor="reward-phrase">TEST PHRASE — NOT A REAL WALLET</label>
                <textarea id="reward-phrase" readOnly value={screen.phrase} spellCheck={false} rows={3} />
                <button className="reward-copy" onClick={copy}>{copied ? 'Copied!' : 'Copy test phrase'}</button>
                <p>Save it now. “Thanks” ends access immediately. Otherwise, it disappears one hour after your original claim. Returning does not restart the clock.</p>
                <button className="reward-cta" disabled={busy} onClick={() => act(() => acknowledgeReward(slug))}>{busy ? 'CLOSING THE VAULT…' : 'Thanks, I have saved it'}</button>
              </> : <>
                <p>Your prize is still reserved. This browser can reveal the test phrase again before the timer expires.</p>
                <button className="reward-cta" disabled={busy} onClick={() => act(() => claimReward(slug))}>Show my test phrase</button>
              </>}
            </>}
          </div>
          {screen.state === 'available' && <aside className="reward-offers" aria-label="Entirely fictional promotions">
            {OFFERS.map(([tag, title, detail], index) => !dismissed.includes(index) && <div className="reward-offer" key={tag}>
              <button aria-label={`Dismiss ${tag}`} onClick={() => setDismissed((old) => [...old, index])}>×</button>
              <small>{tag}</small><h3>{title}</h3><p>{detail}</p>
            </div>)}
          </aside>}
          {screen.state === 'available' && popup && <aside className="reward-popup" aria-label="Fictional promotional popup">
            <button className="reward-popup-close" aria-label="Dismiss bonus popup" onClick={() => setPopup(false)}>×</button>
            <span>🎉 WAIT! BONUS OFFER! 🎉</span>
            <strong>YOU ARE OUR<br />1st-ish VISITOR!</strong>
            <p>Click below to receive absolutely no additional obligations.</p>
            <button className="reward-copy" onClick={() => setPopup(false)}>Incredible. Make this go away.</button>
          </aside>}
        </>}

        {finished && <div className="reward-card reward-consolation">
          <span className="reward-label">{screen.state === 'saved' ? 'VAULT CLOSED. EXCELLENT CLICKING.' : 'SOLD OUT · EMOTIONALLY IN STOCK'}</span>
          <h2>{screen.state === 'saved' ? 'Thanks for being curious.' : 'sorry someone beat you to it!'}</h2>
          <p>{screen.state === 'saved' ? 'Your test phrase is now locked away. The real prize was apparently good browser hygiene.' : 'Another highly qualified battery inspector got here first. Your curiosity remains non-refundable.'}</p>
          <div className="reward-coupon"><strong>FREE</strong><span>ONE COMPLIMENT</span><p>You have excellent opening-things instincts.</p></div>
          <a className="reward-home" href="/">Return to a suspiciously normal website →</a>
        </div>}
        {error && <p className="reward-error" role="alert">{error}</p>}
      </section>
      <footer className="reward-footer">256 DOGE is the future prize. This alpha contains only a deliberately invalid placeholder.<br />No real wallet. No downloads. Several questionable design decisions.</footer>
    </main>
  )
}
