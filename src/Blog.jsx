import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { posts, formatDate } from './posts/index.js'

export default function Blog() {
  useEffect(() => {
    document.body.classList.add('blog-reading')
    return () => document.body.classList.remove('blog-reading')
  }, [])

  return (
    <main className="min-h-svh flex justify-center px-4 py-12">
      <div className="w-full max-w-3xl">
        <Link
          to="/"
          className="
            inline-block mb-8 text-sm text-white/40 hover:text-white/70
            transition-colors duration-200
          "
        >
          ← Home
        </Link>

        <div className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-white/90 mb-1">Blog</h1>
          <p className="text-xs font-mono text-white/30 tracking-widest uppercase">
            aarg.dev / blog
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                to={`/blog/${post.slug}`}
                className="
                  block rounded-2xl border border-white/10 p-7
                  bg-white/5 backdrop-blur-xl
                  shadow-[0_4px_24px_rgba(0,0,0,0.4)]
                  hover:border-white/20 hover:bg-white/8
                  transition-all duration-200 group
                "
              >
                <h2 className="text-lg font-semibold text-white/85 group-hover:text-white transition-colors duration-200 mb-2">
                  {post.title}
                </h2>

                <p className="text-xs text-white/35 mb-3 font-mono">
                  {formatDate(post.date)}&nbsp;&nbsp;·&nbsp;&nbsp;{post.readingTime}
                </p>

                <p className="text-sm text-white/55 leading-relaxed mb-4">{post.excerpt}</p>

                <div className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
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
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
