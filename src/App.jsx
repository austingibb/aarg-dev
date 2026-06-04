import { Link } from 'react-router-dom'

function ExternalIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block ml-1 opacity-50"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

const LINKS = [
  { label: 'Blog',        to: '/blog' },
  { label: 'esummary',    href: 'https://esummary.aarg.dev', external: true },
  { label: 'Cavewise',    href: 'https://austingibb.itch.io/cavewise', external: true },
  { label: 'GitHub',      href: 'https://github.com/austingibb', external: true },
  { label: 'LinkedIn',    href: 'https://linkedin.com/in/austingibb', external: true },
  { label: 'Portfolio',   href: 'https://austingibb.com', external: true },
]

export default function App() {
  return (
    <main className="min-h-svh flex items-center justify-center px-4 py-12">
      <div className="card-float w-full max-w-lg">
        <div
          className="
            rounded-2xl border border-white/10 p-10
            bg-white/5 backdrop-blur-xl
            shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)]
          "
        >
          {/* Name */}
          <h1 className="text-3xl font-semibold tracking-tight text-white/90 mb-1">
            Austin Gibbons
          </h1>
          <p className="text-xs font-mono text-white/30 tracking-widest uppercase mb-8">
            aarg.dev
          </p>

          {/* Description */}
          <p className="text-white/60 text-sm leading-relaxed mb-8">
            My messy website for my own tech services.
          </p>

          {/* Flavor line */}
          <p className="text-white/30 text-xs italic mb-10">
            Everyone keeps wondering what Austin would do if he stopped coding.
            I guess we'll never know.
          </p>

          {/* Links */}
          <nav aria-label="Site sections">
            <ul className="flex flex-wrap gap-3 justify-center">
              {LINKS.map(({ label, to, href, external }) => (
                <li key={label}>
                  {to ? (
                    <Link
                      to={to}
                      className="
                        px-5 py-2 rounded-full text-sm font-medium
                        border border-white/15 text-white/70
                        bg-white/5 hover:bg-white/10 hover:text-white
                        transition-all duration-200
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400
                      "
                    >
                      {label}
                    </Link>
                  ) : (
                    <a
                      href={href}
                      {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
                      className="
                        inline-flex items-center
                        px-5 py-2 rounded-full text-sm font-medium
                        border border-white/15 text-white/70
                        bg-white/5 hover:bg-white/10 hover:text-white
                        transition-all duration-200
                        focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400
                      "
                    >
                      {label}{external && <ExternalIcon />}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </main>
  )
}
