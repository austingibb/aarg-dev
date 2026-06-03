import { Link } from 'react-router-dom'

export default function Blog() {
  return (
    <main className="min-h-svh flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div
          className="
            rounded-2xl border border-white/10 p-10
            bg-white/5 backdrop-blur-xl
            shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]
          "
        >
          <h1 className="text-3xl font-semibold tracking-tight text-white/90 mb-1">
            Blog
          </h1>
          <p className="text-xs font-mono text-white/30 tracking-widest uppercase mb-8">
            aarg.dev / blog
          </p>

          <p className="text-white/50 text-sm leading-relaxed mb-10">
            Nothing here yet. Check back later — thoughts are brewing.
          </p>

          <Link
            to="/"
            className="
              px-5 py-2 rounded-full text-sm font-medium
              border border-white/15 text-white/70
              bg-white/5 hover:bg-white/10 hover:text-white
              transition-all duration-200
              focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400
            "
          >
            ← Home
          </Link>
        </div>
      </div>
    </main>
  )
}
