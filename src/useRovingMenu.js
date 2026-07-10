import { useState, useEffect, useRef, useCallback } from 'react'

/* ----------------------------------------------------------------- *
 * Roving keyboard/mouse menu selection.
 * Arrow keys / j·k move a highlight; g·G / Home·End jump to ends;
 * Enter (or click) activates the selected row; hover also selects.
 * Rows stay real links, so middle-click and screen readers keep working.
 * Returns { selected, rowProps(i) } — spread rowProps onto each <a>.
 * ----------------------------------------------------------------- */
export function useRovingMenu(count) {
  const [selected, setSelected] = useState(0)
  const refs = useRef([])

  // Clamp selection when the menu shrinks (auth state changes the row count).
  // Derived value — no effect needed, so no cascading renders.
  const sel = count === 0 ? 0 : Math.min(selected, Math.max(0, count - 1))

  const focusRow = useCallback((i) => {
    setSelected(i)
    const el = refs.current[i]
    if (el) el.focus({ preventScroll: false })
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (count === 0) return // menu not mounted (e.g. links.sh not running)
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          focusRow((sel + 1) % count)
          break
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          focusRow((sel - 1 + count) % count)
          break
        case 'Home':
        case 'g':
          e.preventDefault()
          focusRow(0)
          break
        case 'End':
        case 'G':
          e.preventDefault()
          focusRow(count - 1)
          break
        case 'Enter': {
          const active = document.activeElement
          if (refs.current[sel] && active !== refs.current[sel]) {
            e.preventDefault()
            refs.current[sel].click()
          }
          break
        }
        default:
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sel, count, focusRow])

  const rowProps = (i) => ({
    ref: (el) => { refs.current[i] = el },
    className: `tui-row ${sel === i ? 'is-sel' : ''}`,
    tabIndex: 0,
    onMouseEnter: () => setSelected(i),
    onFocus: () => setSelected(i),
  })

  return { selected: sel, rowProps }
}
