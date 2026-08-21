/**
 * Weekly Review — look back at any week in the sprint.
 * Target vs actual per activity, a six-week trend for the North Star, that
 * week's milestones, and the three reflection fields that flow straight into
 * the check-in markdown.
 */

import { useMemo, useState } from 'react'
import { useStore } from '../data/storeContext.js'
import { weekSnapshot, weeklyHistory, northStarActivity, trackById } from '../lib/metrics.js'
import { currentSprintWeek, sprintWeeks } from '../lib/dates.js'
import {
  Badge,
  BarSparkline,
  Button,
  Card,
  Dot,
  Empty,
  Icon,
  Input,
  Select,
  Textarea,
} from '../components/ui.jsx'

export default function WeeklyReview({ today, onNavigate }) {
  const { state, actions } = useStore()
  const weeks = useMemo(() => sprintWeeks(state.settings, today), [state.settings, today])
  const thisWeek = currentSprintWeek(state.settings.sprintStartDate, today)
  const [weekNumber, setWeekNumber] = useState(thisWeek)

  const snap = useMemo(() => weekSnapshot(state, weekNumber, today), [state, weekNumber, today])
  const northStar = northStarActivity(state)
  const history = useMemo(
    () => (northStar ? weeklyHistory(state, northStar.id, snap.week, 6) : []),
    [state, northStar, snap.week],
  )
  const northStarColor = northStar ? trackById(state, northStar.trackId)?.color : '#0b1220'

  const review = snap.review
  const setField = (key) => (e) => actions.setReview(weekNumber, { [key]: e.target.value })

  const [newMilestone, setNewMilestone] = useState('')
  const addMilestone = () => {
    const description = newMilestone.trim()
    if (!description) return
    actions.addMilestone({ weekNumber, description })
    setNewMilestone('')
  }

  return (
    <div className="space-y-3">
      {/* ---- week selector ------------------------------------------------ */}
      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <Button
          size="sm"
          onClick={() => setWeekNumber((n) => Math.max(1, n - 1))}
          disabled={weekNumber <= 1}
          aria-label="Previous week"
        >
          ‹
        </Button>
        <Select
          value={weekNumber}
          onChange={(e) => setWeekNumber(Number(e.target.value))}
          aria-label="Select week"
          style={{ width: 'auto' }}
        >
          {weeks.map((w) => (
            <option key={w.week} value={w.week}>
              Week {w.week} · {w.label}
              {w.week === thisWeek ? ' (current)' : ''}
            </option>
          ))}
        </Select>
        <Button
          size="sm"
          onClick={() => setWeekNumber((n) => Math.min(weeks.length, n + 1))}
          disabled={weekNumber >= weeks.length}
          aria-label="Next week"
        >
          ›
        </Button>
        {weekNumber !== thisWeek && (
          <Button size="sm" onClick={() => setWeekNumber(thisWeek)}>
            This week
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {weekNumber === thisWeek && <Badge tone="warn">In progress</Badge>}
          <span className="tabular text-xs text-ink-3">
            {snap.summary.hit}/{snap.summary.total} targets · {snap.summary.pct}% volume
          </span>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* ---- target vs actual ------------------------------------------ */}
        <Card title={`Week ${weekNumber} · target vs actual`} bodyClass="p-0" className="lg:col-span-2">
          {snap.rows.length === 0 ? (
            <Empty
              action={
                <Button size="sm" onClick={() => onNavigate('settings')}>
                  Add activities
                </Button>
              }
            >
              No active activities to review.
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="eyebrow px-3 py-2 sm:px-4">Activity</th>
                    <th className="eyebrow px-2 py-2 text-right">Target</th>
                    <th className="eyebrow px-2 py-2 text-right">Actual</th>
                    <th className="eyebrow px-2 py-2 text-right">%</th>
                    <th className="eyebrow px-2 py-2 pr-3 text-right sm:pr-4">Hit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {snap.rows.map((row) => (
                    <tr key={row.activity.id}>
                      <td className="px-3 py-2 sm:px-4">
                        <span className="flex items-center gap-1.5">
                          <Dot color={row.track?.color} />
                          <span className="truncate">{row.activity.name}</span>
                        </span>
                        <span className="ml-3.5 block text-xs text-ink-3">{row.track?.name}</span>
                      </td>
                      <td className="tabular px-2 py-2 text-right text-ink-2">{row.target}</td>
                      <td className="tabular px-2 py-2 text-right font-semibold">{row.actual}</td>
                      <td
                        className={`tabular px-2 py-2 text-right ${
                          row.pct >= 100 ? 'text-ok' : row.pct < 50 ? 'text-bad' : 'text-warn'
                        }`}
                      >
                        {row.pct}%
                      </td>
                      <td className="px-2 py-2 pr-3 text-right sm:pr-4">
                        {row.hit ? (
                          <span className="text-ok" title="Target hit">
                            <Icon name="check" size={15} className="inline" />
                          </span>
                        ) : (
                          <span className="text-ink-3" title={`${row.remaining} short`}>
                            −{row.remaining}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line bg-canvas">
                    <td className="px-3 py-2 text-xs font-medium sm:px-4">
                      {snap.summary.hit} of {snap.summary.total} targets hit
                    </td>
                    <td colSpan={2} />
                    <td className="tabular px-2 py-2 text-right text-xs font-semibold">
                      {snap.summary.pct}%
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>

        {/* ---- north star trend ------------------------------------------ */}
        <Card title="North Star · last 6 weeks">
          {northStar ? (
            <>
              <p className="mb-2 truncate text-sm font-medium">{northStar.name}</p>
              <BarSparkline data={history} target={northStar.weeklyTarget} color={northStarColor} height={72} />
              <p className="mt-2 border-t border-line pt-2 text-xs text-ink-3">
                Target {northStar.weeklyTarget}/week. Solid bars hit it.
                {history.length > 0 && (
                  <>
                    {' '}
                    Total {history.reduce((n, h) => n + h.value, 0)} across {history.length}{' '}
                    {history.length === 1 ? 'week' : 'weeks'}.
                  </>
                )}
              </p>
            </>
          ) : (
            <Empty>No North Star metric set.</Empty>
          )}
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* ---- reflection ------------------------------------------------- */}
        <Card title="Reflection" className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label mb-1">What worked</span>
              <Textarea rows={4} value={review.worked} onChange={setField('worked')} placeholder="What moved the needle?" />
            </label>
            <label className="block">
              <span className="label mb-1">What blocked me</span>
              <Textarea rows={4} value={review.blocked} onChange={setField('blocked')} placeholder="Where did the week leak?" />
            </label>
            <label className="block">
              <span className="label mb-1">One change for next week</span>
              <Textarea rows={4} value={review.change} onChange={setField('change')} placeholder="One change. Not three." />
            </label>
          </div>
          <p className="mt-2 text-xs text-ink-3">
            Saved as you type, and pulled into the Week {weekNumber} check-in.
          </p>
        </Card>

        {/* ---- milestones -------------------------------------------------- */}
        <Card title={`Week ${weekNumber} milestones`} bodyClass="p-0">
          {snap.milestones.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-ink-3">No milestone for this week.</div>
          ) : (
            <ul className="divide-y divide-line">
              {snap.milestones.map((m) => (
                <li key={m.id} className="group flex items-start gap-2 px-3 py-2 sm:px-4">
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={(e) => actions.updateMilestone(m.id, { done: e.target.checked })}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
                  />
                  <span className={`min-w-0 flex-1 text-sm ${m.done ? 'text-ink-3 line-through' : ''}`}>
                    {m.description}
                  </span>
                  <button
                    type="button"
                    onClick={() => actions.deleteMilestone(m.id)}
                    aria-label="Delete milestone"
                    className="shrink-0 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-bad focus:opacity-100"
                  >
                    <Icon name="trash" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-1.5 border-t border-line p-2.5">
            <Input
              value={newMilestone}
              onChange={(e) => setNewMilestone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMilestone()}
              placeholder={`Add a week ${weekNumber} milestone`}
            />
            <Button onClick={addMilestone} disabled={!newMilestone.trim()}>
              <Icon name="plus" />
            </Button>
          </div>
        </Card>
      </div>

      {/* ---- flags -------------------------------------------------------- */}
      <Card title="Flags" bodyClass="p-0">
        {snap.flags.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-ok sm:px-4">
            <Icon name="check" size={14} className="mr-1 inline" />
            Nothing flagged for this week.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {snap.flags.map((flag, i) => (
              <li key={`${flag.kind}-${i}`} className="flex items-start gap-2 px-3 py-2 text-sm sm:px-4">
                <Badge tone={flag.kind === 'under-target' ? 'warn' : 'bad'} className="mt-0.5 shrink-0">
                  {flag.kind}
                </Badge>
                <span className="min-w-0">{flag.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex justify-end">
        <Button variant="primary" onClick={() => onNavigate('checkin')}>
          Generate week {weekNumber} check-in →
        </Button>
      </div>
    </div>
  )
}
