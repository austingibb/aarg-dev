import { useMetrics, MetricsContext } from './metrics.js'

/* Runs the metrics polling once, above the router, and shares it via context.
 * Because it's mounted above <Routes>, navigating between pages never
 * unmounts it — so the rolling series (eth tps, caffeine, etc.) keep their
 * state instead of resetting every time you return to the home page. */
export function MetricsProvider({ children }) {
  const metrics = useMetrics()
  return <MetricsContext.Provider value={metrics}>{children}</MetricsContext.Provider>
}
