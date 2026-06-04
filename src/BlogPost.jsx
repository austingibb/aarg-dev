import { useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPost, formatDate } from './posts/index.js'

export default function BlogPost() {
  const { slug } = useParams()
  const post = getPost(slug)

  useEffect(() => {
    document.body.classList.add('blog-reading')
    return () => document.body.classList.remove('blog-reading')
  }, [])

  if (!post) {
    return (
      <main className="min-h-svh flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-3xl text-center">
          <h1 className="text-2xl font-semibold text-white/70 mb-4">Post not found</h1>
          <Link
            to="/blog"
            className="
              px-5 py-2 rounded-full text-sm font-medium
              border border-white/15 text-white/70
              bg-white/5 hover:bg-white/10 hover:text-white
              transition-all duration-200
            "
          >
            ← Back to Blog
          </Link>
        </div>
      </main>
    )
  }

  const { title, date, author, readingTime, tags, toc, Content } = post

  return (
    <main className="min-h-svh flex justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        {/* Breadcrumb nav */}
        <nav className="flex items-center gap-2 text-xs font-mono text-white/30 mb-8">
          <Link to="/" className="hover:text-white/60 transition-colors">aarg.dev</Link>
          <span>/</span>
          <Link to="/blog" className="hover:text-white/60 transition-colors">blog</Link>
          <span>/</span>
          <span className="text-white/20 truncate">{slug}</span>
        </nav>

        <article
          className="
            rounded-2xl border border-white/10 px-8 py-10
            bg-white/5 backdrop-blur-xl
            shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]
          "
        >
          {/* Post header */}
          <header className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white/90 leading-snug mb-5">
              {title}
            </h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40 font-mono mb-5">
              <span>{author}</span>
              <span className="text-white/20">·</span>
              <time dateTime={date}>{formatDate(date)}</time>
              <span className="text-white/20">·</span>
              <span>{readingTime}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="
                    px-3 py-0.5 rounded-full text-xs font-medium
                    border border-white/10 text-white/45 bg-white/5
                  "
                >
                  {tag}
                </span>
              ))}
            </div>
          </header>

          {/* Table of contents */}
          {toc && toc.length > 0 && (
            <nav
              aria-label="Table of contents"
              className="
                rounded-xl border border-white/10 bg-white/3 px-6 py-5 mb-10
              "
            >
              <p className="text-xs font-mono text-white/30 uppercase tracking-widest mb-3">
                Contents
              </p>
              <ol className="flex flex-col gap-1.5">
                {toc.map((item, i) => (
                  <li key={item.id} className="flex items-baseline gap-3">
                    <span className="text-xs font-mono text-white/20 tabular-nums w-5 shrink-0">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <a
                      href={`#${item.id}`}
                      className="text-sm text-white/50 hover:text-white/80 transition-colors duration-150"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <hr className="border-white/10 mb-8" />

          {/* Post body */}
          <div className="prose">
            <Content />
          </div>
        </article>
      </div>
    </main>
  )
}
