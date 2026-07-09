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

  const focusRow = useCallback((i) => {
    setSelected(i)
    const el = refs.current[i]
    if (el) el.focus({ preventScroll: false })
  }, [])

  useEffect(() => {
    function onKey(e) {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault()
          focusRow((selected + 1) % count)
          break
        case 'ArrowUp':
        case 'k':
          e.preventDefault()
          focusRow((selected - 1 + count) % count)
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
          if (refs.current[selected] && active !== refs.current[selected]) {
            e.preventDefault()
            refs.current[selected].click()
          }
          break
        }
        default:
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, count, focusRow])

  const rowProps = (i) => ({
    ref: (el) => { refs.current[i] = el },
    className: `tui-row ${selected === i ? 'is-sel' : ''}`,
    tabIndex: 0,
    onMouseEnter: () => setSelected(i),
    onFocus: () => setSelected(i),
  })

  return { selected, rowProps }
}
