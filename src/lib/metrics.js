/**
 * metrics.js — every derived number in the app.
 * =============================================================================
 * Pure functions over `state`. No React, no storage, no Date.now() side effects
 * (today is always an argument, defaulting to the real today) — which means the
 * dashboard, weekly review and check-in generator all read the SAME numbers,
 * and you can unit-test any of it by passing a fixed `today`.
 *
 * The vocabulary used throughout:
 *   week        a Monday→Sunday range, `{ week, start, end, label }`
 *   target      an activity's weeklyTarget
 *   actual      the sum of log counts for that activity inside the week
 *   pct         Math.round(actual / target * 100); 100 when target is 0
 *   hit         actual >= target
 */

import {
  todayISO,
  daysBetween,
  addDays,
  startOfWeek,
  sprintWeekRange,
  currentSprintWeek,
  isWithin,
} from './dates.js'
import { CLOSED_STATUSES, SCREENING_STATUS, statusRank } from '../data/schema.js'

/* -------------------------------------------------------------------------- */
/* thresholds — the numbers behind the warnings. Tune them here.              */
/* -------------------------------------------------------------------------- */

export const THRESHOLDS = {
  /** Flag an activity that logged nothing for this many completed weeks. */
  zeroWeeks: 3,
  /** Flag the North Star at zero for this many completed weeks. */
  northStarZeroWeeks: 2,
  /** Flag a pipeline follow-up this many days past due. */
  overdueDays: 3,
  /** Flag an activity that finished the week under this share of target. */
  underTargetPct: 50,
}

/* -------------------------------------------------------------------------- */
/* selectors                                                                  */
/* -------------------------------------------------------------------------- */

const bySortOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)

export function sortedTracks(state) {
  return [...state.tracks].sort(bySortOrder)
}

export function activeTracks(state) {
  return sortedTracks(state).filter((t) => t.active)
}

export function trackById(state, trackId) {
  return state.tracks.find((t) => t.id === trackId) || null
}

/** All activities in track order, then activity order. Stable for display. */
export function sortedActivities(state) {
  const trackOrder = new Map(sortedTracks(state).map((t, i) => [t.id, i]))
  return [...state.activities].sort((a, b) => {
    const ta = trackOrder.get(a.trackId) ?? 999
    const tb = trackOrder.get(b.trackId) ?? 999
    return ta - tb || bySortOrder(a, b)
  })
}

/**
 * The activities that count: active themselves AND on an active track.
 * Deactivating a track silently removes its activities from targets, the daily
 * log and the check-in, without deleting a single log entry.
 */
export function activeActivities(state) {
  const live = new Set(activeTracks(state).map((t) => t.id))
  return sortedActivities(state).filter((a) => a.active && live.has(a.trackId))
}

export function northStarActivity(state) {
  return state.activities.find((a) => a.isNorthStar) || null
}

export function activityById(state, id) {
  return state.activities.find((a) => a.id === id) || null
}

/* -------------------------------------------------------------------------- */
/* logs                                                                       */
/* -------------------------------------------------------------------------- */

/** Map of `${activityId}|${date}` → log entry. One entry per pair (see schema). */
export function logIndex(logs) {
  const map = new Map()
  for (const log of logs) map.set(`${log.activityId}|${log.date}`, log)
  return map
}

export function logFor(state, activityId, date) {
  return state.logs.find((l) => l.activityId === activityId && l.date === date) || null
}

export function logsOnDate(state, date) {
  return state.logs.filter((l) => l.date === date)
}

/** Total logged for one activity across [start, end] inclusive. */
export function totalFor(state, activityId, start, end) {
  let sum = 0
  for (const log of state.logs) {
    if (log.activityId === activityId && isWithin(log.date, start, end)) sum += log.count
  }
  return sum
}

/* -------------------------------------------------------------------------- */
/* weekly progress                                                            */
/* -------------------------------------------------------------------------- */

/**
 * One row per active activity for the given week:
 *   { activity, track, target, actual, pct, hit, remaining }
 * This is the shape rendered by the dashboard bars, the weekly review table and
 * the check-in markdown, so they can never disagree.
 */
export function weeklyProgress(state, week, { includeInactive = false } = {}) {
  const list = includeInactive ? sortedActivities(state) : activeActivities(state)
  return list.map((activity) => {
    const actual = totalFor(state, activity.id, week.start, week.end)
    const target = Number(activity.weeklyTarget) || 0
    return {
      activity,
      track: trackById(state, activity.trackId),
      target,
      actual,
      pct: target > 0 ? Math.round((actual / target) * 100) : actual > 0 ? 100 : 0,
      hit: target > 0 ? actual >= target : actual > 0,
      remaining: Math.max(0, target - actual),
    }
  })
}

/** Roll-up of a weeklyProgress list: how many targets were hit, overall %. */
export function weeklySummary(rows) {
  const withTarget = rows.filter((r) => r.target > 0)
  const target = withTarget.reduce((n, r) => n + r.target, 0)
  const actual = withTarget.reduce((n, r) => n + Math.min(r.actual, r.target), 0)
  return {
    hit: rows.filter((r) => r.hit).length,
    total: rows.length,
    pct: target > 0 ? Math.round((actual / target) * 100) : 0,
  }
}

/** Weekly actuals for one activity over the N weeks ending at `week`. */
export function weeklyHistory(state, activityId, week, count = 6) {
  const out = []
  for (let i = count - 1; i >= 0; i--) {
    const start = addDays(week.start, -7 * i)
    const end = addDays(start, 6)
    out.push({
      weekNumber: week.week - i,
      start,
      end,
      value: totalFor(state, activityId, start, end),
    })
  }
  return out.filter((w) => w.weekNumber >= 1)
}

/* -------------------------------------------------------------------------- */
/* streaks and droughts                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Consecutive days ending today (or yesterday) with at least one log of count > 0.
 * Today not being logged yet does not break the streak — the day isn't over —
 * so we start counting at today and fall back to yesterday.
 */
export function currentStreak(state, today = todayISO()) {
  const days = new Set(state.logs.filter((l) => l.count > 0).map((l) => l.date))
  if (days.size === 0) return 0
  let cursor = days.has(today) ? today : addDays(today, -1)
  let streak = 0
  while (days.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** The longest run of consecutive logged days ever recorded. */
export function longestStreak(state) {
  const days = [...new Set(state.logs.filter((l) => l.count > 0).map((l) => l.date))].sort()
  let best = 0
  let run = 0
  let prev = null
  for (const day of days) {
    run = prev && daysBetween(prev, day) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = day
  }
  return best
}

/**
 * How many COMPLETED weeks in a row an activity has logged nothing, walking
 * back from the week BEFORE the reference week. The reference week itself is
 * excluded — you cannot be "at zero for the week" halfway through Wednesday.
 *
 * `reference` is any date inside the reference week: pass `today` for "right
 * now", or `week.start` when reporting on a specific (possibly past) week, so a
 * check-in generated retroactively still reads correctly.
 *
 * Weeks before the sprint start are not counted, so a brand-new sprint never
 * shows a drought warning on day one.
 */
export function zeroWeekStreak(state, activityId, reference = todayISO()) {
  const sprintStart = startOfWeek(state.settings.sprintStartDate)
  let weeks = 0
  let start = addDays(startOfWeek(reference), -7)
  while (start >= sprintStart && weeks < 52) {
    if (totalFor(state, activityId, start, addDays(start, 6)) > 0) break
    weeks++
    start = addDays(start, -7)
  }
  return weeks
}

/** Activities dormant for `minWeeks`+ completed weeks, worst first. */
export function dormantActivities(state, reference = todayISO(), minWeeks = THRESHOLDS.zeroWeeks) {
  return activeActivities(state)
    .map((activity) => ({ activity, weeks: zeroWeekStreak(state, activity.id, reference) }))
    .filter((row) => row.weeks >= minWeeks)
    .sort((a, b) => b.weeks - a.weeks)
}

/* -------------------------------------------------------------------------- */
/* pipeline                                                                   */
/* -------------------------------------------------------------------------- */

export function isActiveConversation(item) {
  return !CLOSED_STATUSES.includes(item.status)
}

/** Open items whose follow-up date has arrived or passed, soonest-overdue last. */
export function followUpsDue(state, today = todayISO()) {
  return state.pipeline
    .filter((p) => isActiveConversation(p) && p.nextFollowUpDate && p.nextFollowUpDate <= today)
    .sort((a, b) => a.nextFollowUpDate.localeCompare(b.nextFollowUpDate))
}

/** Open items already past their follow-up date (excludes "due today"). */
export function overdueFollowUps(state, today = todayISO()) {
  return followUpsDue(state, today).filter((p) => p.nextFollowUpDate < today)
}

/** How many days past due, or 0 if not overdue. */
export function overdueByDays(item, today = todayISO()) {
  if (!item.nextFollowUpDate || !isActiveConversation(item)) return 0
  return Math.max(0, daysBetween(item.nextFollowUpDate, today))
}

export function statusCounts(state) {
  const counts = {}
  for (const item of state.pipeline) counts[item.status] = (counts[item.status] || 0) + 1
  return counts
}

/**
 * Pipeline movement inside a week. `Replies received` and `Moved to screening`
 * come from each item's statusHistory trail, so they measure movement DURING
 * the week rather than the item's current state.
 */
export function pipelineMovement(state, week, today = todayISO()) {
  const inWeek = (date) => isWithin(date, week.start, week.end)
  const enteredInWeek = (item, predicate) =>
    (item.statusHistory || []).some((h) => predicate(h.status) && inWeek(h.date))

  return {
    newContacts: state.pipeline.filter((p) => inWeek(p.dateContacted)).length,
    replies: state.pipeline.filter((p) => enteredInWeek(p, (s) => s === 'Replied')).length,
    advanced: state.pipeline.filter((p) =>
      enteredInWeek(p, (s) => statusRank(s) >= statusRank(SCREENING_STATUS) && !CLOSED_STATUSES.includes(s)),
    ).length,
    active: state.pipeline.filter(isActiveConversation).length,
    overdue: overdueFollowUps(state, today).length,
    total: state.pipeline.length,
  }
}

/* -------------------------------------------------------------------------- */
/* milestones and reviews                                                     */
/* -------------------------------------------------------------------------- */

export function milestonesForWeek(state, weekNumber) {
  return state.milestones
    .filter((m) => Number(m.weekNumber) === Number(weekNumber))
    .sort((a, b) => a.description.localeCompare(b.description))
}

export function reviewForWeek(state, weekNumber) {
  return state.reviews[String(weekNumber)] || { worked: '', blocked: '', change: '' }
}

/* -------------------------------------------------------------------------- */
/* flags — the automated "pay attention to this" list                         */
/* -------------------------------------------------------------------------- */

/**
 * Every flag is `{ kind, text }`. The check-in prints `text`; the dashboard
 * groups by `kind`. Order is deliberate: worst signal first.
 *
 * To add a flag: push another entry here and it appears in BOTH places.
 */
export function computeFlags(state, week, today = todayISO()) {
  const flags = []
  const northStar = northStarActivity(state)

  // Dormancy is measured relative to the week being reported on, not to today,
  // so a check-in written for an earlier week still says the right thing.
  const reference = week.start

  // 1. North Star cold for N+ completed weeks.
  if (northStar) {
    const weeks = zeroWeekStreak(state, northStar.id, reference)
    if (weeks >= THRESHOLDS.northStarZeroWeeks) {
      flags.push({
        kind: 'north-star',
        text: `North Star (${northStar.name}) at zero for ${weeks} consecutive completed weeks.`,
      })
    }
  }

  // 2. Other activities dormant for N+ completed weeks. The North Star is
  //    skipped here — rule 1 already covers it, at a lower threshold.
  for (const { activity, weeks } of dormantActivities(state, reference)) {
    if (northStar && activity.id === northStar.id) continue
    flags.push({
      kind: 'dormant',
      text: `${activity.name} at zero for ${weeks} consecutive completed weeks.`,
    })
  }

  // 3. This week's activities below the under-target threshold.
  for (const row of weeklyProgress(state, week)) {
    if (row.target > 0 && row.pct < THRESHOLDS.underTargetPct) {
      flags.push({
        kind: 'under-target',
        text: `${row.activity.name} at ${row.pct}% of target (${row.actual}/${row.target}).`,
      })
    }
  }

  // 4. Follow-ups overdue by N+ days. Always measured against today: an
  //    overdue follow-up is overdue now, whichever week you are reviewing.
  for (const item of overdueFollowUps(state, today)) {
    const days = overdueByDays(item, today)
    if (days >= THRESHOLDS.overdueDays) {
      flags.push({
        kind: 'overdue',
        text: `Follow-up with ${item.company || item.contactName || 'unnamed contact'} overdue by ${days} days.`,
      })
    }
  }

  return flags
}

/* -------------------------------------------------------------------------- */
/* one call for the whole dashboard / check-in                                */
/* -------------------------------------------------------------------------- */

/**
 * Everything a screen needs for one week, computed once.
 * `weekNumber` defaults to the current sprint week.
 */
export function weekSnapshot(state, weekNumber, today = todayISO()) {
  const number = weekNumber ?? currentSprintWeek(state.settings.sprintStartDate, today)
  const week = sprintWeekRange(number, state.settings.sprintStartDate)
  const rows = weeklyProgress(state, week)
  const northStar = northStarActivity(state)
  const northStarRow = northStar ? rows.find((r) => r.activity.id === northStar.id) : null

  return {
    week,
    rows,
    summary: weeklySummary(rows),
    northStar,
    // The North Star may be on an inactive track; compute it directly so the
    // headline card never silently disappears.
    northStarActual: northStar ? totalFor(state, northStar.id, week.start, week.end) : 0,
    northStarTarget: northStar ? Number(northStar.weeklyTarget) || 0 : 0,
    northStarRow,
    movement: pipelineMovement(state, week, today),
    milestones: milestonesForWeek(state, number),
    review: reviewForWeek(state, number),
    flags: computeFlags(state, week, today),
    streak: currentStreak(state, today),
    dueFollowUps: followUpsDue(state, today),
  }
}
