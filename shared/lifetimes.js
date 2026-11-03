/* Selectable lifetimes for clips and short links, shared by the frontend
 * selectors and the backend validation. [key, label, ms] — ms null = forever. */
const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

export const LIFETIMES = [
  ['5m', '5 min', 5 * MIN], ['15m', '15 min', 15 * MIN], ['30m', '30 min', 30 * MIN],
  ...[1, 2, 3, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map((h) => [`${h}h`, `${h} hr`, h * HOUR]),
  ...[1, 2, 3, 4, 5, 6].map((d) => [`${d}d`, d === 1 ? '1 day' : `${d} days`, d * DAY]),
  ['1w', '1 week', 7 * DAY], ['2w', '2 weeks', 14 * DAY],
  ['1mo', '1 month', 30 * DAY], ['6mo', '6 months', 182 * DAY], ['1y', '1 year', 365 * DAY],
  ['forever', 'forever', null],
]
