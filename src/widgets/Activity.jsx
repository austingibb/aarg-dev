import { Spark, PriceChart } from '../terminal.jsx'
import Widget from './Widget.jsx'
import { widgets } from './registry.js'

/* Fixed column widths so the sparkline, time-span label, and value each
 * sit in their own column and line up across every row, regardless of
 * how wide the text is. */
const LABEL_W = '9.8em' // wide enough for "eth transactions"
const SPARK_W = 14   // one cell per point for the 14-point (2-week / 14h) series
const SPAN_W = '2.4em'
const VALUE_W = '4.7em'

/** The right-hand pair of fixed columns: time-span + kind, then value.
 *  `kind` says what the number is: 'Σ' = sum over the window,
 *  'now' = the current / latest value. */
function Tail({ span, kind, value }) {
  return (
    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
      <span
        style={{
          width: SPAN_W, textAlign: 'right', color: 'var(--dim)', opacity: 0.7,
          fontSize: '0.62rem', display: 'flex', flexDirection: 'column', lineHeight: 1.25,
        }}
      >
        <span>{span}</span>
        {kind && <span style={{ opacity: 0.8 }}>{kind}</span>}
      </span>
      <span className="tabular-nums" style={{ width: VALUE_W, textAlign: 'right', color: 'var(--fg)', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}

function MetricRow({ label, color, values, value, span, kind }) {
  return (
    <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
      {/* flexShrink 1 (vs the spark cell's 999): the spark absorbs nearly all
          of a narrow squeeze; the label only ellipsizes as a last resort */}
      <span
        style={{
          color: 'var(--dim)', width: LABEL_W, flexShrink: 1, minWidth: '4.5em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {label}
      </span>
      <Spark values={values} color={color} width={SPARK_W} />
      <Tail span={span} kind={kind} value={value} />
    </div>
  )
}

/** A section header: amber title + a faint comment line beneath it. */
function SectionLabel({ title, note }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--amber)' }}>{title}</p>
      {note && (
        <p style={{ color: 'var(--dim)', opacity: 0.7, fontSize: '0.62rem', marginTop: '2px' }}>
          {note}
        </p>
      )}
    </div>
  )
}

/* ------------------------- activity panel ------------------------- *
 * Split into two jokes:
 *   system        — austin's own vitals, metered like the machine he
 *                   treats me as (caffeine, commits)
 *   for fun graphs — external live data, purely for vibes (eth)
 * ----------------------------------------------------------------- */
function Caffeine({ metrics: { caffeine } }) {
  return <MetricRow label="caffeine" color="amber" values={caffeine.series} span="13h" kind="now"
    value={caffeine.mg != null ? `${Math.round(caffeine.mg)}mg` : '—'} />
}

function Commits({ metrics: { commits } }) {
  return <MetricRow label="commits" color="" values={commits.days} span="2w" kind="Σ"
    value={commits.total != null ? String(commits.total) : '···'} />
}

function EthTransactions({ metrics: { eth } }) {
  return <MetricRow label="eth transactions" color="cyan" values={eth.series} span="~3m" kind="Σ"
    value={eth.total != null ? eth.total.toLocaleString() : '···'} />
}

function EthPrice({ metrics: { ethPrice } }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
        <span style={{ color: 'var(--dim)', width: LABEL_W, flexShrink: 0 }}>eth $</span>
        <Tail span="2w" kind="now" value={ethPrice ? `$${Math.round(ethPrice.price).toLocaleString()}` : '···'} />
      </div>
      <PriceChart values={ethPrice?.series} color="cyan" floor={ethPrice?.floor} />
    </div>
  )
}

function Sp500({ metrics: { sp500 } }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
        <span style={{ color: 'var(--dim)', width: LABEL_W, flexShrink: 0 }}>s&amp;p 500</span>
        <Tail span="2w" kind="now" value={sp500 ? `$${Math.round(sp500.price).toLocaleString()}` : '···'} />
      </div>
      <PriceChart values={sp500?.series} color="green" floor={sp500?.floor} />
    </div>
  )
}

function SoftwareJobs({ metrics: { swdev } }) {
  // year boundaries for the swdev x-axis: series is one bar per month from
  // Feb 2020, so each January sits at index (year - 2020) * 12 - 1
  const swdevYears = swdev
    ? Array.from({ length: new Date().getFullYear() - 2020 }, (_, k) => 2021 + k)
        .map((y) => ({ i: (y - 2020) * 12 - 1, label: String(y) }))
        .filter((t) => t.i < swdev.series.length)
    : []
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center text-xs" style={{ gap: '0.8rem' }}>
        <span
          style={{ color: 'var(--dim)', width: LABEL_W, flexShrink: 0 }}
          title="Indeed Hiring Lab: US software development job postings index, Feb 1 2020 = 100 (via FRED)"
        >
          swe job postings
        </span>
        <Tail
          span={`${new Date().getFullYear() - 2020}y`} kind="now"
          value={swdev ? swdev.index.toFixed(1) : '···'}
        />
      </div>
      <PriceChart values={swdev?.series} color="amber" floor={50} tick={50} unit="" xTicks={swdevYears} />
      {/* Hiring Lab publishes this data freely on the condition that
          Indeed is cited as the source. */}
      <p className="chart-src">
        {'// '}
        <a href="https://data.indeed.com/#/postings" target="_blank" rel="noopener noreferrer">
          indeed hiring lab
        </a>
        {' · feb 2020 = 100'}
      </p>
    </div>
  )
}

const telemetry = {
  caffeine: Caffeine,
  commits: Commits,
  'eth-transactions': EthTransactions,
  'eth-price': EthPrice,
  sp500: Sp500,
  swdev: SoftwareJobs,
}

const groups = [
  { id: 'system', title: 'system', note: '// austin telemetry' },
  { id: 'graphs', title: 'for fun graphs', note: '// external, just for the vibes.' },
]

export default function Activity({ metrics }) {
  return (
    <Widget id="activity" className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2.5">
          <SectionLabel title={group.title} note={group.note} />
          {widgets.filter((widget) => widget.group === group.id).map((widget) => {
            const Content = telemetry[widget.id]
            return <Widget key={widget.id} id={widget.id}><Content metrics={metrics} /></Widget>
          })}
        </section>
      ))}
    </Widget>
  )
}
