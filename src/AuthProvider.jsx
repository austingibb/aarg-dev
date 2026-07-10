import { AuthContext, useAuthState } from './auth.js'

/* Mounts the auth bootstrap (one /api/auth/me on load) above the router so
 * navigating between pages never re-fetches. Exposes { user, loading, refresh }
 * via useAuth(). */
export function AuthProvider({ children }) {
  const auth = useAuthState()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}
