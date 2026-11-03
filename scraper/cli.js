import { loadConfig } from './config.js'
import { Store } from './store.js'

const config = loadConfig()
const [command = 'status', ...args] = process.argv.slice(2)
if (command === 'status') {
  const response = await fetch(`http://127.0.0.1:${config.port}/health`, { signal: AbortSignal.timeout(3000) })
  console.log(JSON.stringify(await response.json(), null, 2))
} else {
  const store = new Store(config.dataDir)
  try {
    switch (command) {
      case 'watch':
        if (args.length !== 2) throw new Error('Usage: watch <owner> <appid>')
        store.subscribe(args[0], args[1]); break
      case 'unwatch':
        if (args.length !== 2) throw new Error('Usage: unwatch <owner> <appid>')
        store.unsubscribe(args[0], args[1]); break
      case 'list': console.log(JSON.stringify(store.subscriptions(), null, 2)); break
      case 'pause': store.set('paused', { at: Date.now(), reason: 'manual', message: 'Paused by operator' }); break
      case 'resume':
        if (args[0] !== '--source-access-restored') throw new Error('After restoring SteamDB access, use: resume --source-access-restored')
        store.set('paused', null); break
      default: throw new Error('Commands: status, list, watch <owner> <appid>, unwatch <owner> <appid>, pause, resume --source-access-restored')
    }
  } finally { store.close() }
}
