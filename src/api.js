/* Fetch wrapper for the aarg.dev API. Credentials: include so the HttpOnly
 * session cookie is sent same-origin (dev proxy + prod nginx both same-origin).
 * Throws { status, error } on non-2xx so callers can render a Notice. */

export async function api(method, path, body) {
  const opts = { method, credentials: 'include' }
  // Always send Content-Type: application/json on state-changing methods
  // (CSRF backstop: the backend requires it; a cross-origin form can't set it).
  if (body !== undefined) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  } else if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    opts.headers = { 'Content-Type': 'application/json' }
  }
  let res
  try {
    res = await fetch(path, opts)
  } catch {
    throw { status: 0, error: 'network error' }
  }
  return parseResponse(res)
}

async function parseResponse(res) {
  let data = null
  const text = await res.text()
  if (text) {
    try { data = JSON.parse(text) }
    catch { data = { error: text } }
  }
  if (!res.ok) throw { status: res.status, error: (data && data.error) || 'request failed' }
  return data
}

/* Typed helpers — one per endpoint. */
export const getMe         = ()            => api('GET',  '/api/auth/me')
export const signup        = (email, password) => api('POST', '/api/auth/signup',  { email, password })
export const login         = (email, password) => api('POST', '/api/auth/login',   { email, password })
export const logout        = ()            => api('POST', '/api/auth/logout')

export const adminLogin    = (psk, totp)   => api('POST', '/api/admin/login', { psk, totp })
export const adminLogout   = ()            => api('POST', '/api/admin/logout')
export const listWhitelist = ()            => api('GET',  '/api/admin/whitelist')
export const addWhitelist  = (email)       => api('POST', '/api/admin/whitelist', { email })
export const removeWhitelist = (email)    => api('DELETE', `/api/admin/whitelist/${encodeURIComponent(email)}`)
export const adminListClips  = ()          => api('GET',  '/api/admin/clips')
export const adminDeleteClip = (path)      => api('DELETE', `/api/admin/clips/${encodeURIComponent(path)}`)

export const getClip       = (path)        => api('GET',  `/api/clip/${encodeURIComponent(path)}`)
export const createClip    = (path, content, withFile = false, replace = false) =>
  api('POST', '/api/clip', {
    ...(path ? { path } : {}), content,
    ...(withFile ? { withFile: true } : {}),
    ...(replace ? { replace: true } : {}),
  })
export const deleteClip    = (path)        => api('DELETE', `/api/clip/${encodeURIComponent(path)}`)

/* Attach a File to a clip. Raw octet-stream body (not JSON — 5 MB of base64
 * would blow past the JSON body cap); filename rides in a header. */
export async function uploadClipFile(path, file) {
  let res
  try {
    res = await fetch(`/api/clip/${encodeURIComponent(path)}/file`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file.name || 'file'),
        'X-File-Mime': file.type || 'application/octet-stream',
      },
      body: file,
    })
  } catch {
    throw { status: 0, error: 'network error' }
  }
  return parseResponse(res)
}

export const clipFileUrl = (path) => `/api/clip/${encodeURIComponent(path)}/file`
