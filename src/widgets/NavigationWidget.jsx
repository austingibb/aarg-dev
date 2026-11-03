import Widget from './Widget.jsx'

export default function NavigationWidget({ links, mode, rowProps, onExit, onLogout, navigate }) {
  return (
    <Widget id="links" className="term-out -mx-2">
      <div className="px-2 pb-1.5">
        <p className="text-xs uppercase" style={{ color: 'var(--amber)', letterSpacing: '0.16em' }}>
          <button
            type="button"
            className="links-program-title"
            onClick={mode === 'links' ? onExit : undefined}
            disabled={mode !== 'links'}
          >
            links.sh
          </button>{' '}
          <span style={{ color: 'var(--dim)', textTransform: 'none', letterSpacing: 0 }}>— site navigator</span>
        </p>
      </div>
      <nav aria-label="Site navigation">
        {links.map((item, i) => {
          const common = mode === 'links' ? rowProps(i) : { className: 'tui-row' }
          const variantClass = item.variant === 'admin' ? ' is-admin' : ''
          const className = `${common.className}${variantClass}`
          const inner = (
            <>
              <span className="caret" aria-hidden="true">›</span>
              <span className="idx">{String(i + 1).padStart(2, '0')}</span>
              <span style={{ color: 'inherit' }}>{item.label}</span>
              <span className="hidden sm:inline text-xs" style={{ color: 'var(--dim)' }}>
                &nbsp;— {item.hint}
              </span>
              <span className="arrow" aria-hidden="true">↵</span>
            </>
          )
          if (item.action === 'logout') {
            return (
              <a key={item.label} {...common} className={className} href="/"
                onClick={(e) => { e.preventDefault(); onLogout() }}>
                {inner}
              </a>
            )
          }
          return item.to ? (
            <a key={item.label} {...common} className={className} href={item.to}
              onClick={(e) => { e.preventDefault(); navigate(item.to) }}>
              {inner}
            </a>
          ) : (
            <a key={item.label} {...common} className={className}
              href={item.href} target="_blank" rel="noopener noreferrer">
              {inner}
            </a>
          )
        })}
      </nav>
    </Widget>
  )
}
