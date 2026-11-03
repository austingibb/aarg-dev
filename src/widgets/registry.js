// Feature metadata only: safe to consume from navigation, routing, and frames
// without importing the feature components back into themselves.
// The private scavenger hunt deliberately has no widget registration.
export const widgets = [
  { id: 'home', title: 'aarg.dev', routes: ['/'], max: '72rem', align: 'center' },
  { id: 'blog', label: 'blog', hint: 'writing & notes', routes: ['/blog'], menu: true, max: '56rem' },
  { id: 'blog-post', title: 'aarg.dev / blog', routes: ['/blog/:slug'] },
  { id: 'cavewise', label: 'cavewise', hint: 'a game on itch.io', href: 'https://austingibb.itch.io/cavewise', menu: true },
  { id: 'paste-book', label: 'paste-book', hint: 'youtube → ebook', href: 'https://paste-book.com', menu: true },
  { id: 'github', label: 'github', hint: 'source & experiments', href: 'https://github.com/austingibb', menu: true },
  { id: 'linkedin', label: 'linkedin', hint: 'professional profile', href: 'https://linkedin.com/in/austingibb', menu: true },
  { id: 'portfolio', label: 'portfolio', hint: 'austingibb.com', href: 'https://austingibb.com', menu: true },
  { id: 'shorten', title: 'aarg.dev / short', label: 'shorten', hint: 'public short urls', routes: ['/short', '/s'], menu: true, max: '50rem' },
  { id: 'clip', label: 'clip', hint: 'ephemeral text and small file drop', routes: ['/clip'], menu: true, visibility: 'whitelisted', max: '48rem' },
  { id: 'clip-view', title: 'aarg.dev / clip', routes: ['/clip/:path', '/c/:path'], max: '52rem' },
  { id: 'login', label: 'login', hint: 'sign in / sign up', routes: ['/login'], menu: true, visibility: 'guest', max: '40rem' },
  { id: 'logout', label: 'logout', action: 'logout', menu: true, visibility: 'user' },
  { id: 'admin', label: 'admin', hint: 'root console', routes: ['/admin'], menu: true, visibility: 'admin', variant: 'admin', max: '56rem' },
  { id: 'resolver', title: 'aarg.dev', max: '48rem' },
  { id: 'whoami', label: 'whoami', presentation: 'inline' },
  { id: 'about', label: 'about', presentation: 'inline' },
  { id: 'files', label: 'files', presentation: 'inline' },
  { id: 'readme', label: 'readme', presentation: 'inline' },
  { id: 'links', label: 'site navigator', presentation: 'inline' },
  { id: 'timezones', label: 'world clock', presentation: 'inline' },
  { id: 'admin-login', label: 'admin login', presentation: 'inline' },
  { id: 'activity', label: 'activity', presentation: 'inline' },
  { id: 'caffeine', label: 'caffeine', presentation: 'inline', group: 'system' },
  { id: 'commits', label: 'commits', presentation: 'inline', group: 'system' },
  { id: 'eth-transactions', label: 'eth transactions', presentation: 'inline', group: 'graphs' },
  { id: 'eth-price', label: 'eth $', presentation: 'inline', group: 'graphs' },
  { id: 'sp500', label: 's&p 500', presentation: 'inline', group: 'graphs' },
  { id: 'swdev', label: 'swe job postings', presentation: 'inline', group: 'graphs' },
]

const byId = new Map(widgets.map((widget) => [widget.id, widget]))

export function getWidget(id) {
  const widget = byId.get(id)
  if (!widget) throw new Error(`Unknown widget: ${id}`)
  return widget
}

// Visibility controls discovery only. Pages and APIs retain their auth checks.
export function getNavigationWidgets(user) {
  const visible = {
    guest: !user?.email,
    user: !!user?.email,
    whitelisted: !!user?.whitelisted,
    admin: !!user?.admin,
  }
  return widgets
    .filter((widget) => widget.menu && (!widget.visibility || visible[widget.visibility]))
    .map((widget) => ({
      ...widget,
      to: widget.routes?.[0],
      hint: widget.action === 'logout' ? user.email : widget.hint,
    }))
}

export const widgetRoutes = widgets.flatMap((widget) =>
  (widget.routes || []).map((path) => ({ id: widget.id, path })),
)
