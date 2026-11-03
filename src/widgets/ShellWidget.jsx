import Widget from './Widget.jsx'
import Timezones from './Timezones.jsx'

/* ---- output blocks ---- */

function WhoamiBlock() {
  return (
    <div className="term-out">
      <h1 className="text-xl sm:text-2xl font-semibold" style={{ color: 'var(--fg-strong)' }}>
        Austin Gibbons
      </h1>
      <p className="text-sm mt-0.5" style={{ color: 'var(--dim)' }}>
        software engineer · builds odd useful things
      </p>
    </div>
  )
}

function AboutBlock() {
  return (
    <p className="term-out text-sm max-w-prose" style={{ color: 'var(--fg)' }}>
      My messy corner of the internet for my own tech services. Everyone keeps
      wondering what Austin would do if he stopped coding. I guess we&apos;ll never know.
    </p>
  )
}

function FilesBlock() {
  return (
    <div className="term-out flex flex-wrap" style={{ gap: '1.8rem', fontSize: '0.9rem' }}>
      <span style={{ color: 'var(--fg)' }}>about.txt</span>
      <span style={{ color: 'var(--green)' }}>admin-login.sh*</span>
      <span style={{ color: 'var(--cyan)' }}>fsociety00.dat</span>
      <span style={{ color: 'var(--green)' }}>links.sh*</span>
      <span style={{ color: 'var(--fg)' }}>readme.txt</span>
      <span style={{ color: 'var(--green)' }}>timezones.sh*</span>
    </div>
  )
}

/* readme.txt — the note Elliot leaves on the encrypted archive
 * (Mr. Robot, "eps1.0_hellofriend.mov"). Rendered as the show frames it:
 * a ruled header, the line alone in the middle, a ruled footer. */
function ReadmeBlock() {
  return (
    <div className="term-out" style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
      <div style={{ color: 'var(--dim)' }}>---------- readme.txt ------------</div>
      <div
        style={{
          color: 'var(--amber)', letterSpacing: '0.22em',
          padding: '0.9rem 0 0.9rem 2.2rem',
        }}
      >
        LEAVE ME HERE
      </div>
      <div style={{ color: 'var(--dim)' }}>_________________________________</div>
    </div>
  )
}

const blocks = {
  whoami: WhoamiBlock,
  about: AboutBlock,
  ls: FilesBlock,
  readme: ReadmeBlock,
  timezones: Timezones,
}

export default function ShellWidget({ kind }) {
  const Content = blocks[kind]
  if (!Content) return null
  return <Widget id={kind === 'ls' ? 'files' : kind}><Content /></Widget>
}
