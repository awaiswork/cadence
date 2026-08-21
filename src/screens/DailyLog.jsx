/**
 * Daily Log — one row per active activity for a chosen date.
 * Writes go straight through `actions.setLog`, which upserts on
 * (activityId, date); there is no save button and nothing to submit.
 */

import { useMemo, useState } from 'react'
import { useStore } from '../data/storeContext.js'
import { activeActivities, logFor, trackById, totalFor } from '../lib/metrics.js'
import {
  addDays,
  formatWeekday,
  formatDate,
  startOfWeek,
  endOfWeek,
  sprintWeekOf,
  weekDays,
} from '../lib/dates.js'
import { Badge, Button, Card, Dot, Empty, Icon, Input } from '../components/ui.jsx'

export default function DailyLog({ today, onNavigate }) {
  const { state, actions } = useStore()
  const [date, setDate] = useState(today)
  const [openNote, setOpenNote] = useState(null) // activityId whose note field is showing

  const activities = useMemo(() => activeActivities(state), [state])
  const weekStart = startOfWeek(date)
  const weekEnd = endOfWeek(date)
  const weekNumber = sprintWeekOf(date, state.settings.sprintStartDate)

  // Which days this week already have entries — the strip doubles as a
  // week-at-a-glance and as navigation.
  const loggedDays = useMemo(() => {
    const set = new Set(state.logs.filter((l) => l.count > 0).map((l) => l.date))
    return weekDays(date).map((d) => ({ date: d, logged: set.has(d) }))
  }, [state.logs, date])

  const dayTotal = state.logs
    .filter((l) => l.date === date)
    .reduce((n, l) => n + l.count, 0)

  const bump = (activity, delta) => actions.incrementLog(activity.id, date, delta)

  return (
    <div className="space-y-3">
      {/* ---- date picker ------------------------------------------------ */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <Button size="sm" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          ‹
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          style={{ width: 'auto' }}
        />
        <Button
          size="sm"
          onClick={() => setDate(addDays(date, 1))}
          disabled={date >= today}
          aria-label="Next day"
        >
          ›
        </Button>
        {date !== today && (
          <Button size="sm" onClick={() => setDate(today)}>
            Today
          </Button>
        )}
        <span className="ml-auto text-xs text-ink-3">
          {formatWeekday(date)} · {formatDate(date)} ·{' '}
          {weekNumber >= 1 ? `week ${weekNumber}` : 'before sprint'}
        </span>
      </div>

      {/* ---- week strip -------------------------------------------------- */}
      <div className="card grid grid-cols-7 divide-x divide-line overflow-hidden">
        {loggedDays.map((day) => {
          const selected = day.date === date
          const future = day.date > today
          return (
            <button
              key={day.date}
              type="button"
              disabled={future}
              onClick={() => setDate(day.date)}
              className={`flex flex-col items-center gap-1 py-2 text-xs ${
                selected ? 'bg-ink text-white' : future ? 'text-ink-3/50' : 'text-ink-2 hover:bg-canvas'
              }`}
            >
              <span>{formatWeekday(day.date)}</span>
              <span className="tabular font-medium">{Number(day.date.slice(-2))}</span>
              <span
                className={`size-1.5 rounded-full ${
                  day.logged ? (selected ? 'bg-white' : 'bg-ok') : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      {/* ---- activity rows ------------------------------------------------ */}
      <Card
        title={`Log · ${formatWeekday(date)} ${formatDate(date, { year: false })}`}
        bodyClass="p-0"
        action={
          <span className="tabular text-xs text-ink-3">
            {dayTotal} logged {date === today ? 'today' : 'this day'}
          </span>
        }
      >
        {activities.length === 0 ? (
          <Empty
            action={
              <Button size="sm" onClick={() => onNavigate('settings')}>
                Add activities
              </Button>
            }
          >
            No active activities to log.
          </Empty>
        ) : (
          <ul className="divide-y divide-line">
            {activities.map((activity) => {
              const entry = logFor(state, activity.id, date)
              const count = entry?.count || 0
              const weekTotal = totalFor(state, activity.id, weekStart, weekEnd)
              const track = trackById(state, activity.trackId)
              const noteOpen = openNote === activity.id || !!entry?.note
              return (
                <li key={activity.id} className="px-3 py-2.5 sm:px-4">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <Dot color={track?.color} />
                        <span className="truncate">{activity.name}</span>
                        {activity.isNorthStar && <Badge>North Star</Badge>}
                      </p>
                      <p className="tabular mt-0.5 text-xs text-ink-3">
                        {weekTotal}/{activity.weeklyTarget} this week
                        {activity.unit ? ` · ${activity.unit}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        onClick={() => bump(activity, -1)}
                        disabled={count === 0}
                        aria-label={`Decrease ${activity.name}`}
                      >
                        <Icon name="minus" />
                      </Button>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={count === 0 && !entry ? '' : count}
                        placeholder="0"
                        onChange={(e) =>
                          actions.setLog(activity.id, date, e.target.value === '' ? 0 : e.target.value)
                        }
                        aria-label={`${activity.name} count`}
                        className="tabular w-14 px-1 text-center"
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => bump(activity, 1)}
                        aria-label={`Add one to ${activity.name}`}
                      >
                        <Icon name="plus" />
                      </Button>
                      <button
                        type="button"
                        onClick={() => setOpenNote(openNote === activity.id ? null : activity.id)}
                        aria-label={`Note for ${activity.name}`}
                        title="Note"
                        className={`rounded-md border px-1.5 py-1.5 ${
                          entry?.note ? 'border-line-2 bg-canvas text-ink' : 'border-line text-ink-3 hover:text-ink'
                        }`}
                      >
                        <Icon name="pencil" />
                      </button>
                    </div>
                  </div>

                  {noteOpen && (
                    <Input
                      type="text"
                      value={entry?.note || ''}
                      placeholder="Note (optional)"
                      onChange={(e) => actions.setLog(activity.id, date, count, e.target.value)}
                      className="mt-2 text-xs"
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* ---- already logged on this date ---------------------------------- */}
      <LoggedSummary state={state} date={date} />
    </div>
  )
}

/** What is already on the record for this date, including inactive activities. */
function LoggedSummary({ state, date }) {
  const entries = state.logs
    .filter((l) => l.date === date)
    .map((l) => ({ log: l, activity: state.activities.find((a) => a.id === l.activityId) }))
    .filter((e) => e.activity)
    .sort((a, b) => a.activity.name.localeCompare(b.activity.name))

  return (
    <Card title="Already logged on this date" bodyClass="p-0">
      {entries.length === 0 ? (
        <Empty>Nothing logged yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {entries.map(({ log, activity }) => (
            <li key={log.id} className="flex items-start gap-2 px-3 py-1.5 text-sm sm:px-4">
              <span className="tabular w-10 shrink-0 text-right font-semibold">{log.count}</span>
              <span className="min-w-0 flex-1">
                <span className="truncate">{activity.name}</span>
                {log.note && <span className="block text-xs text-ink-3 italic">{log.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
