/**
 * dates.js — all week math for the app. Weeks run Monday → Sunday.
 * =============================================================================
 * Everything here works on LOCAL dates represented as 'YYYY-MM-DD' strings.
 *
 * Why strings and not Date objects?
 *   `new Date('2026-08-17')` parses as UTC midnight, which is the previous day
 *   in negative-offset timezones — a classic off-by-one. Every helper below
 *   parses with `new Date(y, m - 1, d)` (local midnight) instead, so a date the
 *   user picked is the date the app stores and shows, in any timezone.
 *
 * Rule of thumb when extending: pass ISO strings across module boundaries,
 * convert to Date only inside a function, and convert back with `toISO()`.
 */

const MS_PER_DAY = 86_400_000

const pad = (n) => String(n).padStart(2, '0')

/** Date → 'YYYY-MM-DD' (local). */
export function toISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 'YYYY-MM-DD' → Date at local midnight. Returns null for empty/invalid input. */
export function fromISO(iso) {
  if (!iso || typeof iso !== 'string') return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Today, local, as 'YYYY-MM-DD'. */
export function todayISO() {
  return toISO(new Date())
}

/** Shift an ISO date by whole days (negative goes back). */
export function addDays(iso, days) {
  const d = fromISO(iso)
  if (!d) return iso
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** Whole days from `a` to `b` (b - a). DST-safe: both ends are local midnight. */
export function daysBetween(a, b) {
  const da = fromISO(a)
  const db = fromISO(b)
  if (!da || !db) return 0
  // Round because a DST boundary makes the raw difference 23 or 25 hours.
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY)
}

/** true when `iso` is a valid date string. */
export function isValidISO(iso) {
  const d = fromISO(iso)
  return !!d && toISO(d) === iso
}

/* -------------------------------------------------------------------------- */
/* week boundaries — Monday to Sunday                                         */
/* -------------------------------------------------------------------------- */

/** Monday of the week containing `iso`. */
export function startOfWeek(iso) {
  const d = fromISO(iso)
  if (!d) return iso
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // Sun(0) → 6, Mon(1) → 0
  return toISO(d)
}

/** Sunday of the week containing `iso`. */
export function endOfWeek(iso) {
  return addDays(startOfWeek(iso), 6)
}

/** The seven ISO dates of the week containing `iso`, Monday first. */
export function weekDays(iso) {
  const monday = startOfWeek(iso)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/** true when `iso` falls inside [start, end] inclusive. Empty dates are false. */
export function isWithin(iso, start, end) {
  if (!iso) return false
  return iso >= start && iso <= end // ISO strings sort chronologically
}

/* -------------------------------------------------------------------------- */
/* sprint weeks                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Which sprint week a date belongs to. Week 1 is the Mon–Sun week containing
 * the sprint start date. Dates before the sprint return 0 or negative numbers,
 * which callers treat as "outside the sprint".
 */
export function sprintWeekOf(iso, sprintStartDate) {
  const base = startOfWeek(sprintStartDate)
  const week = startOfWeek(iso)
  return Math.floor(daysBetween(base, week) / 7) + 1
}

/** { week, start, end, label } for a sprint week number (1-based). */
export function sprintWeekRange(weekNumber, sprintStartDate) {
  const start = addDays(startOfWeek(sprintStartDate), (weekNumber - 1) * 7)
  const end = addDays(start, 6)
  return { week: weekNumber, start, end, label: formatRange(start, end) }
}

/** The current sprint week for today (clamped to at least 1). */
export function currentSprintWeek(sprintStartDate, today = todayISO()) {
  return Math.max(1, sprintWeekOf(today, sprintStartDate))
}

/**
 * Every week of the sprint as a range object, plus any weeks you have already
 * run past the planned end (so a sprint that overruns still shows up).
 */
export function sprintWeeks(settings, today = todayISO()) {
  const planned = Math.max(1, Number(settings.sprintWeeks) || 12)
  const reached = currentSprintWeek(settings.sprintStartDate, today)
  const count = Math.max(planned, reached)
  return Array.from({ length: count }, (_, i) => sprintWeekRange(i + 1, settings.sprintStartDate))
}

/* -------------------------------------------------------------------------- */
/* formatting                                                                 */
/* -------------------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** '17 Aug 2026' */
export function formatDate(iso, { year = true } = {}) {
  const d = fromISO(iso)
  if (!d) return '—'
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`
}

/** 'Mon' */
export function formatWeekday(iso) {
  const d = fromISO(iso)
  if (!d) return ''
  return WEEKDAYS[(d.getDay() + 6) % 7]
}

/** '17–23 Aug 2026' — collapses the shared month/year where possible. */
export function formatRange(startISO, endISO) {
  const s = fromISO(startISO)
  const e = fromISO(endISO)
  if (!s || !e) return '—'
  const sameYear = s.getFullYear() === e.getFullYear()
  const sameMonth = sameYear && s.getMonth() === e.getMonth()
  if (sameMonth) return `${s.getDate()}–${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
  if (sameYear) {
    return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`
  }
  return `${formatDate(startISO)} – ${formatDate(endISO)}`
}

/** 'today' / 'tomorrow' / '3 days overdue' / 'in 5 days' — for follow-up chips. */
export function relativeDayLabel(iso, today = todayISO()) {
  const diff = daysBetween(today, iso)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return '1 day overdue'
  if (diff < 0) return `${Math.abs(diff)} days overdue`
  return `in ${diff} days`
}
