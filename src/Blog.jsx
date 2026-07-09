import { useNavigate } from 'react-router-dom'
import { posts, formatDate } from './posts/index.js'
import { Screen, Window, Prompt, Clock, StatusDot } from './terminal.jsx'
import { useRovingMenu } from './useRovingMenu.js'
import { useActive } from './metrics.js'

// row 0 is "back home", then one row per post
export default function Blog() {
  const navigate = useNavigate()
  const active = useActive()
  const targets = ['/', ...posts.map((p) => `/blog/${p.slug}`)]
  const { rowProps } = useRovingMenu(targets.length)

  const go = (path) => (e) => { e.preventDefault(); navigate(path) }

  return (
    <Screen align="top" max="56rem">
      <Window title="aarg.dev / blog" tag={`${posts.length} entr${posts.length === 1 ? 'y' : 'ies'}`}>
        <div className="px-6 pt-7 pb-4">
          <Prompt cmd="cd ~/blog && ls -l" cursor />
        </div>

        <hr className="tui-sep" />

        <div className="py-3">
          {/* back home */}
          <a {...rowProps(0)} href="/" onClick={go('/')}>
            <span className="caret" aria-hidden="true">›</span>
            <span className="idx" aria-hidden="true">..</span>
            <span style={{ color: 'inherit' }}>../</span>
            <span className="text-xs" style={{ color: 'var(--dim)' }}>&nbsp;— home</span>
            <span className="arrow" aria-hidden="true">↵</span>
          </a>

          {posts.map((post, i) => {
            const rp = rowProps(i + 1)
            return (
            <a
              {...rp}
              key={post.slug}
              href={`/blog/${post.slug}`}
              onClick={go(`/blog/${post.slug}`)}
              className={`${rp.className} !items-start !py-3`}
            >
              <span className="caret mt-0.5" aria-hidden="true">›</span>
              <span className="idx mt-0.5">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex-1 min-w-0">
                <span className="block font-medium" style={{ color: 'var(--fg-strong)' }}>
                  {post.title}
                </span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--dim)' }}>
                  {formatDate(post.date)} · {post.readingTime} · {post.tags.join(', ')}
                </span>
                <span className="block text-xs mt-1.5" style={{ color: 'var(--fg)' }}>
                  {post.excerpt}
                </span>
              </span>
              <span className="arrow mt-0.5" aria-hidden="true">↵</span>
            </a>
            )
          })}
        </div>

        <hr className="tui-sep" />

        <div className="px-6 py-3 tui-status">
          <StatusDot active={active} />
          <span><kbd>↑</kbd>/<kbd>↓</kbd> move</span>
          <span><kbd>⏎</kbd> open</span>
          <span style={{ marginLeft: 'auto' }}><Clock /></span>
        </div>
      </Window>
    </Screen>
  )
}
