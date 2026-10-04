import { Link } from 'react-router-dom'

export default function RewardEntrance({ slug, screen, password, setPassword, busy, error, onUnlock, onRetry }) {
  const next = encodeURIComponent(`/${slug}`)
  const login = screen.state === 'login_required'
  const loading = screen.state === 'loading'
  const available = screen.reward_available === true
  return <main className="signal-world">
    <div className="signal-nebula" aria-hidden="true" />
    <div className="signal-stars" aria-hidden="true" />
    <header className="signal-header"><Link to="/">aarg.dev <span>/ somewhere inside</span></Link><span>TRANSMISSION · 001</span></header>
    <section className="signal-content" aria-label="A surprise inside">
      <div className="signal-orbit" aria-hidden="true"><i /><i /><i /><span>✦</span></div>
      <p className="signal-eyebrow">FOR THOSE WHO LOOK A LITTLE CLOSER</p>
      <h1>{loading ? 'A signal in the noise.' : screen.recovery ? 'Your signal is still here.' : available ? 'You found the signal.' : 'There’s still something inside.'}</h1>
      <p className="signal-intro">Some ideas are best kept inside.<br />Some are waiting to be found.</p>
      <div className="signal-panel">
        {loading ? <p role="status">Listening to the universe…</p> : login ? <>
          <span className="signal-marker">{screen.recovery ? 'RETURN TO YOUR DISCOVERY' : 'CURIOSITY HAS ITS REWARDS'}</span>
          <h2>{screen.recovery ? 'Welcome back, explorer.' : 'One small step. Something unexpected.'}</h2>
          <p>{screen.recovery ? 'Sign in to the account you used to claim, in this browser. Your original recovery window is still ticking.' : 'A reward awaits the curious. Create an account to follow the signal. It will be worth it.'}</p>
          {!screen.recovery && <Link className="signal-primary" to={`/login?mode=signup&next=${next}`}>Create an account <span aria-hidden="true">↗</span></Link>}
          <Link className={screen.recovery ? 'signal-primary' : 'signal-secondary'} to={`/login?next=${next}`}>{screen.recovery ? 'Log in to continue' : 'Already have an account? Log in'}</Link>
          {available && <small>Alpha experience · a playful demo reward, no real funds.</small>}
        </> : <form onSubmit={(event) => { event.preventDefault(); onUnlock() }}>
          <span className="signal-marker">THE NEXT CLUE IS CLOSER THAN YOU THINK</span>
          <h2>Look under the battery.</h2>
          <p>Enter the password printed there.<br />Let’s see what was left for you.</p>
          <label htmlFor="reward-password">The password from inside</label>
          <input id="reward-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={128} required autoComplete="off" spellCheck={false} />
          <button className="signal-primary" disabled={busy || !password}>{busy ? 'Following the signal…' : 'See what’s inside ↗'}</button>
          {available && <small>Your account is ready. The discovery is still ahead.</small>}
        </form>}
        {error && <div className="signal-error" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>Try again</button></div>}
      </div>
      <p className="signal-footnote">WHAT CAN BE KNOWN?<span>Only one way to find out.</span></p>
    </section>
  </main>
}
