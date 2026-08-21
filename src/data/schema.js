/**
 * schema.js — the shape of everything Cadence Tracker stores.
 * =============================================================================
 * This file is the single source of truth for the data model. Nothing here
 * touches React or localStorage; it is plain data + factory functions so you can
 * read, extend, or reuse it without pulling in the rest of the app.
 *
 * HOW TO EXTEND
 * -------------
 * 1. Adding a field to an existing entity
 *      - add it to the relevant `make*()` factory with a sensible default
 *      - old records already in localStorage simply won't have the key, so read
 *        it defensively (`item.myField ?? fallback`) or add a migration in
 *        storage.js and bump SCHEMA_VERSION.
 * 2. Adding a whole new entity (say, "Goal")
 *      - add a `makeGoal()` factory here
 *      - add an empty array for it in `emptyState()`
 *      - add reducer cases in store.jsx (the CRUD helpers there are generic)
 * 3. Changing seed data
 *      - edit `seedState()`. Seeds are applied ONLY when localStorage is empty,
 *        so editing them will not affect an install that already has data.
 *        Use Settings → Reset all data to re-seed.
 *
 * INVARIANTS the rest of the app relies on
 * ----------------------------------------
 *   - every entity has a unique string `id`
 *   - `activity.trackId` always points at an existing track (deleting a track
 *     cascades to its activities and their logs — see store.jsx)
 *   - dates are stored as 'YYYY-MM-DD' local-date strings, never Date objects
 *     and never ISO timestamps, so they survive JSON round-trips unambiguously
 *   - at most one activity has `isNorthStar: true` (the store enforces this)
 */

/** Bumped whenever a migration is needed. See storage.js → migrate(). */
export const SCHEMA_VERSION = 1

/* -------------------------------------------------------------------------- */
/* ids                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Collision-resistant enough for a single-user local app, and readable in
 * exported JSON. Uses crypto.randomUUID when available.
 */
export function uid(prefix = 'id') {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rand}`
}

/* -------------------------------------------------------------------------- */
/* enums / option lists                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Pipeline stages, in funnel order. Order matters: `statusRank()` uses the
 * index to answer "did this move to screening or beyond?". Add new stages in
 * the position they belong in the funnel; the terminal Closed-* stages should
 * stay last.
 */
export const PIPELINE_STATUSES = [
  'Contacted',
  'Followed Up',
  'Replied',
  'Screening',
  'Interview',
  'Offer',
  'Closed-Won',
  'Closed-Lost',
]

/** Stages that mean the conversation is over (either way). */
export const CLOSED_STATUSES = ['Closed-Won', 'Closed-Lost']

/** First stage at/after which a contact counts as "moved to screening or beyond". */
export const SCREENING_STATUS = 'Screening'

/** Position of a status in the funnel; -1 for unknown statuses. */
export function statusRank(status) {
  return PIPELINE_STATUSES.indexOf(status)
}

export function isClosed(status) {
  return CLOSED_STATUSES.includes(status)
}

/**
 * Suggested outreach channels. Free-text is allowed everywhere a channel is
 * entered — this list only drives the datalist suggestions and filters.
 */
export const DEFAULT_CHANNELS = [
  'Cold email',
  'LinkedIn',
  'Referral',
  'Job board',
  'Upwork',
  'Company site',
  'Event',
]

/** Palette offered when creating a track. Any hex value is accepted. */
export const TRACK_COLORS = [
  '#2563eb', // blue
  '#0d9488', // teal
  '#7c3aed', // violet
  '#db2777', // pink
  '#ea580c', // orange
  '#16a34a', // green
  '#dc2626', // red
  '#ca8a04', // amber
  '#0891b2', // cyan
  '#4f46e5', // indigo
]

/* -------------------------------------------------------------------------- */
/* entity factories                                                           */
/* -------------------------------------------------------------------------- */

/** Track: a workstream. Activities hang off it and inherit its colour. */
export function makeTrack(patch = {}) {
  return {
    id: uid('trk'),
    name: 'New track',
    color: TRACK_COLORS[0],
    active: true,
    /** Manual sort position; lower sorts first. See store → moveTrack(). */
    order: 0,
    ...patch,
  }
}

/**
 * Activity: a countable thing you do each week, owned by exactly one track.
 * `unit` is cosmetic (shown next to counts). `isNorthStar` marks the single
 * headline metric surfaced on the dashboard and in the check-in.
 */
export function makeActivity(patch = {}) {
  return {
    id: uid('act'),
    trackId: null,
    name: 'New activity',
    weeklyTarget: 1,
    unit: '',
    isNorthStar: false,
    /** Inactive activities keep their history but drop out of logging/targets. */
    active: true,
    order: 0,
    ...patch,
  }
}

/**
 * LogEntry: how much of one activity you did on one day.
 * There is at most ONE entry per (activityId, date) pair — the daily log
 * upserts rather than appending, so counts stay easy to reason about.
 */
export function makeLogEntry(patch = {}) {
  return {
    id: uid('log'),
    activityId: null,
    date: null, // 'YYYY-MM-DD'
    count: 0,
    note: '',
    ...patch,
  }
}

/**
 * PipelineItem: one company/person conversation.
 * `statusHistory` is an append-only trail of { status, date } written whenever
 * the status changes. The weekly "pipeline movement" numbers are derived from
 * it, which is why editing status via the store (not by hand) matters.
 */
export function makePipelineItem(patch = {}) {
  const status = patch.status || PIPELINE_STATUSES[0]
  const dateContacted = patch.dateContacted ?? null
  return {
    id: uid('pip'),
    company: '',
    channel: '',
    contactName: '',
    role: '',
    dateContacted,
    status,
    nextFollowUpDate: '',
    notes: '',
    statusHistory: [{ status, date: dateContacted || '' }],
    ...patch,
  }
}

/** Milestone: a checkpoint pinned to a sprint week. */
export function makeMilestone(patch = {}) {
  return {
    id: uid('mil'),
    weekNumber: 1,
    description: '',
    done: false,
    ...patch,
  }
}

/**
 * WeeklyReview: the three free-text reflection fields, keyed by week number.
 * Stored as a map (`reviews[weekNumber]`) rather than a list because there is
 * exactly one review per week.
 */
export function makeReview(patch = {}) {
  return { worked: '', blocked: '', change: '', ...patch }
}

/* -------------------------------------------------------------------------- */
/* whole-app state                                                            */
/* -------------------------------------------------------------------------- */

/** Today as a local 'YYYY-MM-DD' string (duplicated from lib/dates to keep this file dependency-free). */
function todayISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** The Monday on or before the given local date string. */
function mondayOnOrBefore(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const shift = (dt.getDay() + 6) % 7 // Mon=0 … Sun=6
  dt.setDate(dt.getDate() - shift)
  const p = (n) => String(n).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export function defaultSettings() {
  return {
    /** Week 1 of the sprint starts on this date's Monday-to-Sunday week. */
    sprintStartDate: mondayOnOrBefore(todayISO()),
    /** How many weeks the sprint runs. Weekly Review pages through these. */
    sprintWeeks: 12,
    /** Channels offered as suggestions in the pipeline editor. */
    channels: [...DEFAULT_CHANNELS],
  }
}

/** A valid, completely empty state — used by Reset and as the migration base. */
export function emptyState() {
  return {
    version: SCHEMA_VERSION,
    settings: defaultSettings(),
    tracks: [],
    activities: [],
    logs: [],
    pipeline: [],
    milestones: [],
    reviews: {},
  }
}

/**
 * Seed data. Applied ONLY on first run (empty localStorage) or after a reset.
 * Everything here is editable in Settings afterwards — none of it is referenced
 * by id anywhere else in the codebase.
 */
export function seedState() {
  const state = emptyState()

  // ---- tracks -------------------------------------------------------------
  const trackSeeds = [
    { name: 'Contract Outreach', color: '#2563eb' },
    { name: 'Finland/EU Jobs', color: '#0d9488' },
    { name: 'Build', color: '#7c3aed' },
    { name: 'Interview Prep', color: '#ea580c' },
    // Home for metrics that are not owned by a single track. Rename or delete
    // it like any other track.
    { name: 'Cross-track', color: '#4f46e5' },
  ]
  state.tracks = trackSeeds.map((t, i) => makeTrack({ ...t, order: i }))
  const track = (name) => state.tracks.find((t) => t.name === name).id

  // ---- activities ---------------------------------------------------------
  const activitySeeds = [
    { track: 'Contract Outreach', name: 'Cold emails sent', weeklyTarget: 20, unit: 'emails' },
    { track: 'Contract Outreach', name: 'Follow-ups sent', weeklyTarget: 10, unit: 'follow-ups' },
    { track: 'Finland/EU Jobs', name: 'Applications submitted', weeklyTarget: 15, unit: 'apps' },
    { track: 'Finland/EU Jobs', name: 'Hiring manager DMs', weeklyTarget: 15, unit: 'DMs' },
    { track: 'Build', name: 'Hours on project', weeklyTarget: 11, unit: 'hours' },
    { track: 'Interview Prep', name: 'Practice sessions', weeklyTarget: 2, unit: 'sessions' },
    { track: 'Cross-track', name: 'Screening calls booked', weeklyTarget: 2, unit: 'calls', isNorthStar: true },
  ]
  state.activities = activitySeeds.map((a, i) =>
    makeActivity({
      trackId: track(a.track),
      name: a.name,
      weeklyTarget: a.weeklyTarget,
      unit: a.unit,
      isNorthStar: !!a.isNorthStar,
      order: i,
    }),
  )

  // ---- milestones ---------------------------------------------------------
  const milestoneSeeds = [
    [1, 'All assets built (CV, portfolio, platform profiles, templates)'],
    [3, 'First screening call booked'],
    [6, '2+ active contract conversations, project shipped, 1+ interview'],
    [9, 'Contract signed or offer in hand'],
    [12, 'Income target reached'],
  ]
  state.milestones = milestoneSeeds.map(([weekNumber, description]) =>
    makeMilestone({ weekNumber, description }),
  )

  return state
}
