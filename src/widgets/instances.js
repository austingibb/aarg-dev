import { createContext, useContext } from 'react'
import { getWidget } from './registry.js'

export const WidgetInstanceContext = createContext(null)

/** Serializable instance data. Multiple pins can share a widget type while
 * keeping their own identity and configuration (for example a Steam app ID).
 * Storage and account ownership belong to the eventual dashboard/API layer. */
export function createWidgetInstance(widgetId, config = {}, id = crypto.randomUUID()) {
  const definition = getWidget(widgetId)
  return { id, widgetId, config: { ...definition.defaultConfig, ...config } }
}

export function useWidgetInstance() {
  const instance = useContext(WidgetInstanceContext)
  if (!instance) throw new Error('useWidgetInstance must be used inside a Widget')
  return instance
}
