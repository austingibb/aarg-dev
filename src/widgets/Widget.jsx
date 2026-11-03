import { Screen, Window } from '../terminal.jsx'
import { getWidget } from './registry.js'
import { WidgetInstanceContext } from './instances.js'

/** One feature container, either a full page or a composable inline widget.
 * Feature state stays in its component; the registry owns shared defaults. */
export default function Widget({ id, instance, children, presentation, title, tag, max, align, className = '', ...props }) {
  const widgetId = instance?.widgetId ?? id
  const definition = getWidget(widgetId)
  if (id && instance && id !== instance.widgetId) throw new Error('Widget type does not match its instance')
  const value = {
    id: instance?.id ?? widgetId,
    widgetId,
    config: { ...definition.defaultConfig, ...instance?.config },
  }
  const content = <WidgetInstanceContext.Provider value={value}>{children}</WidgetInstanceContext.Provider>
  const layout = presentation ?? definition.presentation ?? 'page'
  if (layout === 'inline') {
    return <div {...props} data-widget={widgetId} data-widget-instance={value.id} className={className}>{content}</div>
  }
  return (
    <Screen max={max ?? definition.max} align={align ?? definition.align ?? 'top'}>
      <Window
        {...props}
        widgetId={widgetId}
        instanceId={value.id}
        title={title ?? definition.title ?? `aarg.dev / ${definition.label}`}
        tag={tag}
        className={className}
      >
        {content}
      </Window>
    </Screen>
  )
}
