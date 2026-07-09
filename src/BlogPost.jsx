import { useParams, useNavigate, Link } from 'react-router-dom'
import { getPost, formatDate } from './posts/index.js'
import { Screen, Window, Prompt, Clock } from './terminal.jsx'

export default function BlogPost() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const post = getPost(slug)

  if (!post) {
    return (
      <Screen>
        <Window title="aarg.dev / blog / 404">
          <div className="px-6 py-10">
            <Prompt cmd={`cat ${slug}.md`} />
            <p className="mt-3 text-sm" style={{ color: 'var(--red)' }}>
              error: no such entry — post not found.
            </p>
            <Link
              to="/blog"
              className="tui-row is-sel mt-6 inline-flex"
              style={{ maxWidth: 'max-content' }}
            >
              <span className="caret">›</span>
              <span>back to blog</span>
            </Link>
          </div>
        </Window>
      </Screen>
    )
  }

  const { title, date, author, readingTime, tags, toc, Content } = post

  return (
    <Screen align="top">
      <Window title="aarg.dev / blog" tag={readingTime}>
        {/* breadcrumb prompt */}
        <div className="px-6 pt-7 pb-4">
          <Prompt path="~/blog" cmd={`cat ${slug}.md`} cursor />
        </div>

        <hr className="tui-sep" />

        <article className="px-6 sm:px-8 py-8">
          <header className="mb-8">
            <h1
              className="text-xl sm:text-2xl font-semibold leading-snug mb-3"
              style={{ color: 'var(--fg-strong)' }}
            >
              {title}
            </h1>
            <div className="text-xs mb-4" style={{ color: 'var(--dim)' }}>
              {author} · <time dateTime={date}>{formatDate(date)}</time> · {readingTime}
            </div>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 border"
                  style={{ color: 'var(--amber)', borderColor: 'var(--border)' }}
                >
                  #{tag.toLowerCase().replace(/\s+/g, '-')}
                </span>
              ))}
            </div>
          </header>

          {toc && toc.length > 0 && (
            <nav
              aria-label="Table of contents"
              className="mb-9 border p-5"
              style={{ borderColor: 'var(--border)' }}
            >
              <p className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--amber)' }}>
                contents
              </p>
              <ol className="flex flex-col gap-1.5">
                {toc.map((item, i) => (
                  <li key={item.id} className="flex items-baseline gap-3 text-sm">
                    <span className="tabular-nums text-xs" style={{ color: 'var(--dim)', width: '1.6em' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <a
                      href={`#${item.id}`}
                      style={{ color: 'var(--fg)' }}
                      className="hover:underline underline-offset-4"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <hr className="tui-sep mb-8" />

          <div className="prose">
            <Content />
          </div>
        </article>

        <hr className="tui-sep" />

        <div className="px-6 py-3 tui-status">
          <a
            href="/blog"
            onClick={(e) => { e.preventDefault(); navigate('/blog') }}
            style={{ color: 'var(--amber)' }}
          >
            ‹ back to blog
          </a>
          <span style={{ marginLeft: 'auto' }}><Clock /></span>
        </div>
      </Window>
    </Screen>
  )
}
