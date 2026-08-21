/**
 * reducer.js — every state transition in Cadence Tracker, as a pure function.
 * =============================================================================
 * Split out of store.jsx so it can be reasoned about (and tested) with no React
 * involved: `reducer(state, action) -> newState`, no mutation, no side effects.
 *
 * HOW TO ADD AN ACTION
 *   1. add a `case` below returning a NEW state object (never mutate `state`)
 *   2. add a matching helper to `actions` in store.jsx, so components call
 *      `actions.doThing(x)` and never build action objects by hand
 *
 * Invariants enforced here rather than in the UI:
 *   - deleting a track deletes its activities and their logs (cascade)
 *   - deleting an activity deletes its logs
 *   - at most one activity is the North Star
 *   - one log entry per (activityId, date); zeroing it with no note removes it
 *   - a pipeline status change appends to that item's statusHistory trail
 */

import {
  emptyState,
  seedState,
  makeTrack,
  makeActivity,
  makeLogEntry,
  makePipelineItem,
  makeMilestone,
  makeReview,
  TRACK_COLORS,
} from './schema.js'

/* -------------------------------------------------------------------------- */
/* helpers used by the reducer                                                */
/* -------------------------------------------------------------------------- */

/** Replace the item with `id` by merging `patch` into it. */
const patchById = (list, id, patch) =>
  list.map((item) => (item.id === id ? { ...item, ...patch } : item))

/** Renumber `order` 0..n-1 after an insert, delete or move. */
const renumber = (list) => list.map((item, i) => ({ ...item, order: i }))

/** Move the item with `id` by `delta` positions inside its own ordering. */
function reorder(list, id, delta) {
  const sorted = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const from = sorted.findIndex((item) => item.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= sorted.length) return list
  const [moved] = sorted.splice(from, 1)
  sorted.splice(to, 0, moved)
  return renumber(sorted)
}

/* -------------------------------------------------------------------------- */
/* reducer                                                                    */
/* -------------------------------------------------------------------------- */

export function reducer(state, action) {
  switch (action.type) {
    /* ---- whole-state ----------------------------------------------------- */
    case 'SET_STATE':
      return action.state
    case 'RESET':
      return action.seed ? seedState() : emptyState()

    /* ---- settings -------------------------------------------------------- */
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    /* ---- tracks ---------------------------------------------------------- */
    case 'ADD_TRACK': {
      const track = makeTrack({
        // Pick the next unused palette colour so new tracks look distinct.
        color: TRACK_COLORS[state.tracks.length % TRACK_COLORS.length],
        ...action.patch,
        order: state.tracks.length,
      })
      return { ...state, tracks: [...state.tracks, track] }
    }
    case 'UPDATE_TRACK':
      return { ...state, tracks: patchById(state.tracks, action.id, action.patch) }
    case 'MOVE_TRACK':
      return { ...state, tracks: reorder(state.tracks, action.id, action.delta) }
    case 'DELETE_TRACK': {
      // Cascade: a track's activities and their logs go with it. Deactivating
      // a track instead (UPDATE_TRACK { active: false }) keeps all history.
      const doomedActivities = state.activities.filter((a) => a.trackId === action.id)
      const doomedIds = new Set(doomedActivities.map((a) => a.id))
      return {
        ...state,
        tracks: renumber(
          [...state.tracks].sort((a, b) => a.order - b.order).filter((t) => t.id !== action.id),
        ),
        activities: state.activities.filter((a) => a.trackId !== action.id),
        logs: state.logs.filter((l) => !doomedIds.has(l.activityId)),
      }
    }

    /* ---- activities ------------------------------------------------------ */
    case 'ADD_ACTIVITY': {
      const siblings = state.activities.filter((a) => a.trackId === action.patch.trackId)
      const activity = makeActivity({ ...action.patch, order: siblings.length })
      const activities = [...state.activities, activity]
      return {
        ...state,
        // Enforce the single-North-Star invariant on the way in.
        activities: activity.isNorthStar ? clearOtherNorthStars(activities, activity.id) : activities,
      }
    }
    case 'UPDATE_ACTIVITY': {
      const activities = patchById(state.activities, action.id, action.patch)
      return {
        ...state,
        activities: action.patch.isNorthStar
          ? clearOtherNorthStars(activities, action.id)
          : activities,
      }
    }
    case 'MOVE_ACTIVITY': {
      // Reordering happens within a track, so only siblings take part.
      const activity = state.activities.find((a) => a.id === action.id)
      if (!activity) return state
      const siblings = state.activities.filter((a) => a.trackId === activity.trackId)
      const others = state.activities.filter((a) => a.trackId !== activity.trackId)
      return { ...state, activities: [...others, ...reorder(siblings, action.id, action.delta)] }
    }
    case 'DELETE_ACTIVITY':
      return {
        ...state,
        activities: state.activities.filter((a) => a.id !== action.id),
        logs: state.logs.filter((l) => l.activityId !== action.id),
      }

    /* ---- logs ------------------------------------------------------------ */
    case 'SET_LOG': {
      // Upsert on (activityId, date). A count of 0 with no note removes the
      // entry entirely, so "logged nothing" and "never logged" stay the same
      // thing and the streak maths stays honest.
      const { activityId, date, count, note } = action
      const existing = state.logs.find((l) => l.activityId === activityId && l.date === date)
      const nextCount = Math.max(0, Number(count) || 0)
      const nextNote = note ?? existing?.note ?? ''

      if (nextCount === 0 && !nextNote.trim()) {
        return existing ? { ...state, logs: state.logs.filter((l) => l !== existing) } : state
      }
      if (existing) {
        return {
          ...state,
          logs: patchById(state.logs, existing.id, { count: nextCount, note: nextNote }),
        }
      }
      return {
        ...state,
        logs: [...state.logs, makeLogEntry({ activityId, date, count: nextCount, note: nextNote })],
      }
    }
    case 'INCREMENT_LOG': {
      // Relative change, resolved against the CURRENT state rather than
      // whatever the component last rendered — two fast taps on +1 in the same
      // React batch must add 2, not 1.
      const { activityId, date, delta } = action
      const existing = state.logs.find((l) => l.activityId === activityId && l.date === date)
      const next = Math.max(0, (existing?.count || 0) + delta)
      return reducer(state, {
        type: 'SET_LOG',
        activityId,
        date,
        count: next,
        note: existing?.note ?? '',
      })
    }
    case 'DELETE_LOG':
      return { ...state, logs: state.logs.filter((l) => l.id !== action.id) }

    /* ---- pipeline -------------------------------------------------------- */
    case 'ADD_PIPELINE_ITEM':
      return { ...state, pipeline: [makePipelineItem(action.patch), ...state.pipeline] }
    case 'UPDATE_PIPELINE_ITEM': {
      const item = state.pipeline.find((p) => p.id === action.id)
      if (!item) return state
      const patch = { ...action.patch }
      // A status change appends to the trail that drives weekly movement stats.
      if (patch.status && patch.status !== item.status) {
        patch.statusHistory = [
          ...(item.statusHistory || []),
          { status: patch.status, date: action.date || todayLocalISO() },
        ]
      }
      return { ...state, pipeline: patchById(state.pipeline, action.id, patch) }
    }
    case 'DELETE_PIPELINE_ITEM':
      return { ...state, pipeline: state.pipeline.filter((p) => p.id !== action.id) }

    /* ---- milestones ------------------------------------------------------ */
    case 'ADD_MILESTONE':
      return { ...state, milestones: [...state.milestones, makeMilestone(action.patch)] }
    case 'UPDATE_MILESTONE':
      return { ...state, milestones: patchById(state.milestones, action.id, action.patch) }
    case 'DELETE_MILESTONE':
      return { ...state, milestones: state.milestones.filter((m) => m.id !== action.id) }

    /* ---- weekly reviews -------------------------------------------------- */
    case 'SET_REVIEW': {
      const key = String(action.weekNumber)
      return {
        ...state,
        reviews: { ...state.reviews, [key]: makeReview({ ...state.reviews[key], ...action.patch }) },
      }
    }

    default:
      return state
  }
}

/** Keep exactly one North Star by clearing the flag everywhere else. */
function clearOtherNorthStars(activities, keepId) {
  return activities.map((a) => (a.id === keepId || !a.isNorthStar ? a : { ...a, isNorthStar: false }))
}

/** Local 'YYYY-MM-DD' — kept here so the reducer has no import cycle with lib/. */
function todayLocalISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
