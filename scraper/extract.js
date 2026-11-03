// This function is serialized into the page by Playwright. Keep it self-contained.
// Read visible public content and already-loaded chart objects only; no private
// endpoints, challenge interaction, or additional network calls.
export function extractSteamDb({ kind, appId }) {
  const text = document.body?.innerText || ''
  if (/you have been banned|access denied|sorry, you have been blocked/i.test(text)) return { error: 'source_blocked' }
  if (/verifying you are human|verify you are human|checking your browser|performing security verification|just a moment|enable javascript and cookies to continue/i.test(text + document.title)) return { error: 'source_challenge' }
  const number = value => {
    const clean = String(value ?? '').replace(/[,\s\u00a0]/g, '')
    return /^\d+$/.test(clean) && Number.isSafeInteger(Number(clean)) ? Number(clean) : null
  }
  if (kind === 'rankings') {
    for (const table of document.querySelectorAll('table')) {
      const headings = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim().toLowerCase())
      const currentIndex = headings.findIndex(value => value === 'current' || value === 'players now')
      const dayIndex = headings.findIndex(value => /24.*peak/.test(value))
      const peakIndex = headings.findIndex(value => /all.time.*peak/.test(value))
      if (currentIndex < 0) continue
      const games = []
      for (const row of table.querySelectorAll('tbody tr')) {
        const link = row.querySelector('a[href^="/app/"]')
        const id = link?.getAttribute('href')?.match(/^\/app\/(\d+)\//)?.[1]
        const cells = [...row.querySelectorAll('td')]
        if (!id || !cells[currentIndex]) continue
        // The image link may come before the title link.
        const name = [...row.querySelectorAll(`a[href^="/app/${id}/"]`)].map(a => a.textContent.trim()).find(Boolean)
        const currentPlayers = number(cells[currentIndex].textContent)
        if (!name || currentPlayers === null) continue
        games.push({ appId: Number(id), name, currentPlayers, peak24h: number(cells[dayIndex]?.textContent), allTimePeak: number(cells[peakIndex]?.textContent) })
      }
      if (games.length) return { games: games.sort((a, b) => b.currentPlayers - a.currentPlayers).slice(0, 10) }
    }
    return { error: 'rankings_not_found' }
  }

  if (location.origin !== 'https://steamdb.info' || !new RegExp(`^/app/${appId}/charts/?$`).test(location.pathname)) return { error: 'page_url_mismatch' }
  const name = document.querySelector('h1')?.textContent.trim()
  const countBefore = label => {
    const match = text.match(new RegExp('([0-9][0-9, \\u00a0]*)\\s*' + label, 'i'))
    return match ? number(match[1]) : null
  }
  const currentPlayers = countBefore('players right now') ?? countBefore('players in-game') ?? countBefore('in-game')
  const peak24h = countBefore('24[ -]hour peak') ?? countBefore('24h peak')
  const allTimePeak = countBefore('all[ -]time peak')
  const series = []
  for (const chart of window.Highcharts?.charts || []) {
    for (const item of chart?.series || []) {
      if (item.options?.isInternal || !/players|concurrent/i.test(item.name || '') || /twitch|viewer/i.test(item.name || '')) continue
      const points = []
      for (const point of item.options?.data || []) {
        const at = Array.isArray(point) ? point[0] : point.x
        const players = Array.isArray(point) ? point[1] : point.y
        if (Number.isFinite(at) && at > 1000000000000 && Number.isSafeInteger(players) && players >= 0) points.push({ at, players })
      }
      if (points.length) series.push({ name: item.name, points: points.slice(-10000) })
    }
  }
  if (!name || currentPlayers === null) return { error: 'game_data_not_found' }
  return { appId, name, currentPlayers, peak24h, allTimePeak, source: 'steamdb', sourceUrl: location.href, series, historyStatus: series.length ? 'available' : 'unavailable' }
}

export function validateResult(result, job) {
  const error = code => Object.assign(new Error(code.replaceAll('_', ' ')), { code })
  if (result?.error) throw error(result.error)
  const validCount = count => Number.isSafeInteger(count) && count >= 0
  const validGame = game => game && Number.isSafeInteger(game.appId) && game.appId > 0 && game.appId <= 4294967295 && typeof game.name === 'string' && game.name.length > 0 && game.name.length <= 500 && validCount(game.currentPlayers) && [game.peak24h, game.allTimePeak].every(count => count === null || validCount(count))
  if (job.kind === 'rankings') {
    if (!Array.isArray(result?.games) || result.games.length !== 10 || !result.games.every(validGame) || new Set(result.games.map(game => game.appId)).size !== 10) throw error('invalid_rankings')
  } else if (!validGame(result) || result.appId !== job.appId) throw error('invalid_game')
  return result
}
