import { useEffect, useState } from 'react'
import { getAdminReward, armReward } from './api.js'
import { Button, Notice, Confirm } from './terminal.jsx'

export default function RewardAdmin() {
  const [reward, setReward] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    let active = true
    getAdminReward().then((data) => { if (active) setReward(data) }).catch((e) => { if (active) setError(e.error || 'failed to load reward') })
    return () => { active = false }
  }, [])
  async function run(arm = false) {
    if (busy) return
    setBusy(true); setError('')
    try { setReward(await (arm ? armReward() : getAdminReward())); setConfirm(false) }
    catch (e) { setError(e.error || 'reward request failed') }
    finally { setBusy(false) }
  }
  return <div className="flex flex-col gap-4">
    <p className="text-sm">Curiosity reward · alpha · fake phrase only</p>
    <p className="text-xs" style={{ color: 'var(--dim)' }}>No funds or real wallet credentials. The first Claim reserves this test prize for one browser for up to one hour.</p>
    {reward && <>
      <p>Status: <strong>{reward.state}</strong></p>
      <a href={reward.url} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)', overflowWrap: 'anywhere' }}>{new URL(reward.url, window.location.origin).href}</a>
      {reward.expires_at && <p className="text-xs">Recovery deadline: {new Date(reward.expires_at).toLocaleString()}</p>}
      {reward.acknowledged_at && <p className="text-xs">Saved: {new Date(reward.acknowledged_at).toLocaleString()}</p>}
      {reward.state === 'disarmed' && (confirm ? <Confirm message="Arm this alpha reward? The first claimant gets the fake phrase. This button cannot reset a claimed reward." confirmLabel="Arm reward" onConfirm={() => run(true)} onCancel={() => setConfirm(false)} /> : <Button disabled={busy} onClick={() => setConfirm(true)}>Arm reward</Button>)}
      {reward.state !== 'disarmed' && <p className="text-xs" style={{ color: 'var(--dim)' }}>Arming is unavailable once armed or claimed. Disarmed visitors see the consolation page.</p>}
    </>}
    <Button disabled={busy} onClick={() => run()}>Refresh status</Button>
    <Notice kind="error">{error}</Notice>
  </div>
}
