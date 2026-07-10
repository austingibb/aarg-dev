import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { getMe } from './api.js'

/* Auth state for aarg.dev. Mirrors the metrics.js / MetricsProvider split:
 * the provider mounts above <Routes> so the session survives navigation.
 *
 * user shape: { email, whitelisted, admin } | null
 *   - null  = not logged in (guest)
 *   - admin === true only when the live session carries the admin flag AND
 *     the backend confirms it on /api/auth/me (capability re-checked per
 *     request server-side, so this is the source of truth for the UI).
 */
export const AuthContext = createContext({ user: null, loading: true, refresh: async () => {} })

export function useAuth() {
  return useContext(AuthContext)
}

export function useAuthState() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await getMe()
      // Show user if logged in OR if admin (admin session may have no user email).
      setUser(me && (me.email || me.admin) ? me : null)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch /api/auth/me once on mount; setState happens in the async callback.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh() }, [refresh])

  return { user, loading, refresh, setUser }
}
