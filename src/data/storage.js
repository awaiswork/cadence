/**
 * storage.js — persistence. The only module that talks to localStorage.
 * =============================================================================
 * Responsibilities:
 *   - load state on boot (seeding on first run, migrating older payloads)
 *   - save state (debounced by the caller in store.jsx)
 *   - export to / import from a JSON file
 *
 * Everything is defensive: a corrupt or hand-edited localStorage value must
 * never white-screen the app. `loadState()` always returns a usable state.
 *
 * HOW TO ADD A MIGRATION
 * ----------------------
 * When a change makes old saved data invalid:
 *   1. bump SCHEMA_VERSION in schema.js
 *   2. add a function to the MIGRATIONS map keyed by the version you are
 *      migrating FROM, returning the upgraded state:
 *
 *        const MIGRATIONS = {
 *          1: (s) => ({ ...s, activities: s.activities.map(a => ({ ...a, foo: 0 })) }),
 *        }
 *
 * Migrations run in sequence until the state reaches SCHEMA_VERSION.
 */

import { SCHEMA_VERSION, emptyState, seedState, makePipelineItem } from './schema.js'

export const STORAGE_KEY = 'cadence-tracker:v1'

/* -------------------------------------------------------------------------- */
/* migrations                                                                 */
/* -------------------------------------------------------------------------- */

/** version-to-migrate-from → (state) => upgraded state. Empty for v1. */
const MIGRATIONS = {}

function migrate(state) {
  let out = state
  let guard = 0
  while ((out.version ?? 0) < SCHEMA_VERSION && guard++ < 50) {
    const from = out.version ?? 0
    const step = MIGRATIONS[from]
    out = step ? { ...step(out), version: from + 1 } : { ...out, version: from + 1 }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* normalisation                                                              */
/* -------------------------------------------------------------------------- */

const asArray = (v) => (Array.isArray(v) ? v : [])
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

/**
 * Coerce whatever we parsed into a state object with every key present and of
 * the right type. Unknown extra keys on entities are preserved, so a field you
 * add later survives a load/save cycle even before you write a migration.
 */
export function normalizeState(raw) {
  const base = emptyState()
  const input = asObject(raw)
  const settings = asObject(input.settings)

  const state = {
    version: Number(input.version) || SCHEMA_VERSION,
    settings: {
      ...base.settings,
      ...settings,
      sprintWeeks: Math.max(1, Number(settings.sprintWeeks) || base.settings.sprintWeeks),
      channels: asArray(settings.channels).length
        ? asArray(settings.channels).map(String)
        : base.settings.channels,
    },
    tracks: asArray(input.tracks).map((t, i) => ({
      ...t,
      id: String(t.id),
      name: String(t.name ?? 'Untitled track'),
      color: String(t.color ?? '#2563eb'),
      active: t.active !== false,
      order: Number.isFinite(t.order) ? t.order : i,
    })),
    activities: asArray(input.activities).map((a, i) => ({
      ...a,
      id: String(a.id),
      trackId: a.trackId ?? null,
      name: String(a.name ?? 'Untitled activity'),
      weeklyTarget: Math.max(0, Number(a.weeklyTarget) || 0),
      unit: String(a.unit ?? ''),
      isNorthStar: !!a.isNorthStar,
      active: a.active !== false,
      order: Number.isFinite(a.order) ? a.order : i,
    })),
    logs: asArray(input.logs)
      .map((l) => ({
        ...l,
        id: String(l.id),
        activityId: l.activityId ?? null,
        date: String(l.date ?? ''),
        count: Number(l.count) || 0,
        note: String(l.note ?? ''),
      }))
      .filter((l) => l.activityId && l.date),
    pipeline: asArray(input.pipeline).map((p) => {
      const item = makePipelineItem({ ...p, id: String(p.id) })
      // Older exports (or hand-written JSON) may have no history trail.
      const history = asArray(p.statusHistory).filter((h) => h && h.status)
      item.statusHistory = history.length
        ? history
        : [{ status: item.status, date: item.dateContacted || '' }]
      return item
    }),
    milestones: asArray(input.milestones).map((m) => ({
      ...m,
      id: String(m.id),
      weekNumber: Math.max(1, Number(m.weekNumber) || 1),
      description: String(m.description ?? ''),
      done: !!m.done,
    })),
    reviews: Object.fromEntries(
      Object.entries(asObject(input.reviews)).map(([week, r]) => [
        String(week),
        {
          worked: String(asObject(r).worked ?? ''),
          blocked: String(asObject(r).blocked ?? ''),
          change: String(asObject(r).change ?? ''),
        },
      ]),
    ),
  }

  // Referential integrity: drop orphans rather than render broken rows.
  const trackIds = new Set(state.tracks.map((t) => t.id))
  state.activities = state.activities.filter((a) => trackIds.has(a.trackId))
  const activityIds = new Set(state.activities.map((a) => a.id))
  state.logs = state.logs.filter((l) => activityIds.has(l.activityId))

  // Enforce "at most one North Star": the first one wins.
  let seenNorthStar = false
  state.activities = state.activities.map((a) => {
    if (a.isNorthStar && !seenNorthStar) {
      seenNorthStar = true
      return a
    }
    return a.isNorthStar ? { ...a, isNorthStar: false } : a
  })

  return state
}

/* -------------------------------------------------------------------------- */
/* load / save                                                                */
/* -------------------------------------------------------------------------- */

function hasStorage() {
  try {
    const probe = '__cadence_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false // Safari private mode, disabled storage, SSR…
  }
}

export const storageAvailable = typeof window !== 'undefined' && hasStorage()

/**
 * Read state from localStorage.
 * First run (nothing stored) → seeded state. Corrupt data → seeded state, and
 * the bad payload is copied to `${STORAGE_KEY}:corrupt` so nothing is lost.
 */
export function loadState() {
  if (!storageAvailable) return seedState()
  let raw
  try {
    raw = window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return seedState()
  }
  if (!raw) return seedState()
  try {
    return normalizeState(migrate(JSON.parse(raw)))
  } catch (err) {
    console.error('[cadence] stored data was unreadable; starting fresh', err)
    try {
      window.localStorage.setItem(`${STORAGE_KEY}:corrupt`, raw)
    } catch {
      /* quota — nothing else we can do */
    }
    return seedState()
  }
}

/** Write state. Returns true on success; false if storage is full/unavailable. */
export function saveState(state) {
  if (!storageAvailable) return false
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch (err) {
    console.error('[cadence] could not save', err)
    return false
  }
}

/* -------------------------------------------------------------------------- */
/* export / import                                                            */
/* -------------------------------------------------------------------------- */

/** Pretty-printed JSON of the whole state, with a little provenance metadata. */
export function exportJSON(state, now = new Date()) {
  return JSON.stringify({ ...state, exportedAt: now.toISOString(), app: 'cadence-tracker' }, null, 2)
}

/** Trigger a browser download of the export. */
export function downloadExport(state, now = new Date()) {
  const stamp = now.toISOString().slice(0, 10)
  const blob = new Blob([exportJSON(state, now)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cadence-tracker-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Parse an exported file back into state.
 * Throws with a human-readable message when the file is not usable, so the
 * Settings screen can show it verbatim.
 */
export function importJSON(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('That file does not contain a Cadence Tracker backup.')
  }
  const looksRight = ['tracks', 'activities', 'logs', 'pipeline', 'milestones'].some((k) =>
    Array.isArray(parsed[k]),
  )
  if (!looksRight) {
    throw new Error('No tracks, activities or logs found in that file.')
  }
  return normalizeState(migrate(parsed))
}
