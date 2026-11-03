import test from 'node:test'
import assert from 'node:assert/strict'
import { widgets, getWidget, getNavigationWidgets, widgetRoutes } from '../src/widgets/registry.js'
import { createWidgetInstance } from '../src/widgets/instances.js'

const navigation = (user) => getNavigationWidgets(user).map(({ id }) => id)

test('navigation follows guest, account, whitelist, and independent admin sessions', () => {
  const guest = navigation(null)
  assert.ok(guest.includes('login'))
  assert.ok(guest.includes('shorten'))
  for (const id of ['clip', 'logout', 'admin']) assert.ok(!guest.includes(id))
  const user = { email: 'test@example.invalid', whitelisted: false, admin: false }
  assert.ok(navigation(user).includes('logout'))
  assert.ok(!navigation(user).includes('login'))
  assert.ok(!navigation(user).includes('clip'))
  assert.equal(getNavigationWidgets(user).find(({ id }) => id === 'logout').hint, user.email)
  assert.ok(navigation({ ...user, whitelisted: true }).includes('clip'))
  assert.ok(navigation({ admin: true }).includes('admin'))
  assert.ok(navigation({ admin: true }).includes('login'))
  assert.ok(!navigation({ admin: true }).includes('logout'))
})

test('widget routes preserve public aliases without enumerating the private hunt', () => {
  const routes = Object.fromEntries(widgetRoutes.map(({ id, path }) => [path, id]))
  assert.equal(routes['/'], 'home')
  assert.equal(routes['/blog/:slug'], 'blog-post')
  assert.equal(routes['/short'], routes['/s'])
  assert.equal(routes['/clip/:path'], routes['/c/:path'])
  assert.equal(new Set(widgetRoutes.map(({ path }) => path)).size, widgetRoutes.length)
  assert.equal(new Set(widgets.map(({ id }) => id)).size, widgets.length)
  assert.ok(!widgets.some(({ id }) => /reward|scavenger/.test(id)))
  assert.ok(!routes['/:path'])
  assert.throws(() => getWidget('reward'), /Unknown widget/)
})

test('multiple pins of one widget have independent serializable identity and configuration', () => {
  const first = createWidgetInstance('timezones', { city: 'London' })
  const second = createWidgetInstance('timezones', { city: 'Tokyo' })
  assert.equal(first.widgetId, second.widgetId)
  assert.notEqual(first.id, second.id)
  second.config.city = 'Seattle'
  assert.equal(first.config.city, 'London')
  const restored = JSON.parse(JSON.stringify(first))
  assert.deepEqual(createWidgetInstance(restored.widgetId, restored.config, restored.id), first)
  assert.throws(() => createWidgetInstance('missing'), /Unknown widget/)
})
