# Cadence Tracker

A personal weekly execution tracker for a 12-week income sprint. Four parallel tracks,
one North Star metric, an outreach pipeline, and a weekly check-in you can paste straight
into a coaching conversation.

Single user, no auth, no backend. Everything lives in `localStorage`.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # production build into dist/
npm run preview    # serve the production build
npm run lint       # oxlint
```

To log from your phone on the same network:

```bash
npm run dev -- --host
```

Then open the Network URL it prints. Note that on a plain `http://` LAN address the
Clipboard API is unavailable, so the check-in screen falls back to a legacy copy path
automatically.

## Screens

| Screen | What it is for |
| --- | --- |
| **Dashboard** | Current sprint week, North Star vs target, per-activity progress bars, follow-ups due, log streak, stalled-activity warnings. |
| **Daily Log** | One row per active activity for a chosen date. `+1` buttons, direct number entry, optional per-entry note. |
| **Pipeline** | Every outreach conversation. Sortable, filterable, inline add/edit/delete. Overdue follow-ups are tinted red, today's amber. |
| **Weekly Review** | Any week in the sprint: target vs actual table, six-week North Star trend, milestones, and three reflection fields. |
| **Check-in** | Generates the markdown summary and copies it to the clipboard. |
| **Settings** | Sprint dates, tracks, activities, targets, milestones, export/import/reset. |

## Data model

Defined in [`src/data/schema.js`](src/data/schema.js), which is the single source of truth
and is commented for extension.

```
Track         { id, name, color, active, order }
Activity      { id, trackId, name, weeklyTarget, unit, isNorthStar, active, order }
LogEntry      { id, activityId, date, count, note }
PipelineItem  { id, company, channel, contactName, role, dateContacted,
                status, nextFollowUpDate, notes, statusHistory[] }
Milestone     { id, weekNumber, description, done }
WeeklyReview  reviews[weekNumber] = { worked, blocked, change }
```

Dates are always local `'YYYY-MM-DD'` strings, never `Date` objects or ISO timestamps, so
they survive JSON round-trips without timezone drift.

`statusHistory` is appended to automatically whenever a pipeline item's status changes. It
is what makes "replies received **this week**" and "moved to screening **this week**"
measure movement rather than current state.

### Invariants enforced in the reducer, not the UI

- Deleting a track deletes its activities and their logs; deleting an activity deletes its logs.
- At most one activity is the North Star.
- One log entry per `(activityId, date)`. Setting a count to zero with no note removes the
  entry entirely, so "logged nothing" and "never logged" stay the same thing.

## Extending it

Adding a track, an activity, or a milestone is a **Settings action, never a code change**.
The seed data in `seedState()` is applied only when `localStorage` is empty, so editing it
will not disturb an install that already has data — use Settings → Reset to re-seed.

Where to make deeper changes:

| Change | File |
| --- | --- |
| New field on an entity | `src/data/schema.js` (a `make*` factory) |
| New state transition | `src/data/reducer.js`, then a helper in `src/data/store.jsx` |
| New derived metric | `src/lib/metrics.js` |
| Change a warning threshold | `THRESHOLDS` in `src/lib/metrics.js` |
| New automated flag | `computeFlags()` in `src/lib/metrics.js` — it appears in the check-in *and* the review |
| Check-in wording or sections | `src/lib/checkin.js` |
| Migrate old saved data | `MIGRATIONS` in `src/data/storage.js`, and bump `SCHEMA_VERSION` |

## Conventions

- **Weeks run Monday to Sunday.** All week maths is in `src/lib/dates.js`; nothing else
  computes a week boundary.
- **Dormancy is measured in completed weeks.** The in-progress week never counts toward a
  "at zero for N weeks" warning, and a retroactively generated check-in measures dormancy
  relative to *that* week, not to today.
- **Track colours are the only saturated colour in the UI.** The chrome stays monochrome so
  a glance at a bar identifies its track. Semantic green/amber/red mean status, never decoration.
- Metrics are pure functions of `(state, week, today)`, so the dashboard, the weekly review
  and the check-in can never disagree about a number.

## File structure

```
src/
  main.jsx                 entry point
  App.jsx                  shell: header, tabs, hash routing
  index.css                Tailwind v4 theme tokens + shared primitives
  data/
    schema.js              entity shapes, factories, enums, seed data
    reducer.js             every state transition, pure and testable
    store.jsx              <StoreProvider>: reducer + debounced persistence
    storeContext.js        the context object and useStore()
    storage.js             localStorage, migrations, export/import
  lib/
    dates.js               Monday–Sunday week maths, sprint weeks, formatting
    metrics.js             all derived numbers: progress, streaks, pipeline, flags
    checkin.js             markdown generator + clipboard
  components/
    ui.jsx                 Card, Button, Badge, ProgressBar, Modal, Icon, …
  screens/
    Dashboard.jsx  DailyLog.jsx  Pipeline.jsx
    WeeklyReview.jsx  CheckIn.jsx  Settings.jsx
```

## Backups

All data is in this browser under the `cadence-tracker:v1` key. Clearing site data wipes
it. Settings → Export JSON writes a dated backup; Import replaces everything currently
stored. Both are validated — a malformed file shows an error and changes nothing.

## Stack

Vite 8 · React 19 · Tailwind CSS v4 · JavaScript. No backend, no external APIs, no runtime
dependencies beyond React.
