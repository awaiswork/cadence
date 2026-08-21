/**
 * Dashboard — the "am I on track this week?" screen.
 * Read-only apart from the North Star quick-add; everything is derived from
 * metrics.weekSnapshot so it can never disagree with the check-in.
 */

import { useMemo } from 'react'
import { useStore } from '../data/storeContext.js'
import { weekSnapshot, longestStreak } from '../lib/metrics.js'
import { relativeDayLabel } from '../lib/dates.js'
import { Badge, Button, Card, Dot, Empty, Icon, ProgressBar } from '../components/ui.jsx'

export default function Dashboard({ today, onNavigate }) {
  const { state, actions } = useStore()
  const snap = useMemo(() => weekSnapshot(state, undefined, today), [state, today])
  const best = useMemo(() => longestStreak(state), [state])

  const { week, rows, summary, northStar, northStarActual, northStarTarget } = snap
  const dormant = snap.flags.filter((f) => f.kind === 'dormant' || f.kind === 'north-star')
  const nothingConfigured = state.activities.length === 0

  // Group progress rows under their track so the page reads as four columns of
  // work rather than one long undifferentiated list.
  const byTrack = useMemo(() => {
    const groups = []
    for (const row of rows) {
      const last = groups[groups.length - 1]
      if (last && last.track?.id === row.track?.id) last.rows.push(row)
      else groups.push({ track: row.track, rows: [row] })
    }
    return groups
  }, [rows])

  return (
    <div className="space-y-3">
      {dormant.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn-bg px-3 py-2.5 text-warn">
          <Icon name="warning" size={16} className="mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {dormant.length === 1 ? '1 activity has stalled' : `${dormant.length} activities have stalled`}
            </p>
            <ul className="mt-0.5 space-y-0.5 text-xs">
              {dormant.map((flag) => (
                <li key={flag.text}>{flag.text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {/* ---- North Star ---------------------------------------------- */}
        <div className="card p-4 lg:col-span-2">
          {northStar ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="eyebrow">North Star · this week</p>
                  <h2 className="mt-1 truncate text-base font-semibold">{northStar.name}</h2>
                </div>
                <Button
                  size="sm"
                  onClick={() => actions.incrementLog(northStar.id, today, 1)}
                  title={`Log one ${northStar.name} today`}
                >
                  <Icon name="plus" /> Log one
                </Button>
              </div>

              <div className="mt-3 flex items-end gap-2">
                <span className="tabular text-5xl leading-none font-semibold tracking-tight">
                  {northStarActual}
                </span>
                <span className="tabular pb-1 text-xl leading-none text-ink-3">
                  / {northStarTarget}
                </span>
                <span className="pb-1.5 ml-auto">
                  {northStarTarget > 0 && northStarActual >= northStarTarget ? (
                    <Badge tone="ok">
                      <Icon name="check" size={11} /> Target hit
                    </Badge>
                  ) : (
                    <Badge tone={northStarActual > 0 ? 'warn' : 'neutral'}>
                      {Math.max(0, northStarTarget - northStarActual)} to go
                    </Badge>
                  )}
                </span>
              </div>

              <div className="mt-3">
                <ProgressBar
                  value={northStarActual}
                  max={northStarTarget}
                  height={10}
                  color={snap.northStarRow?.track?.color || '#0b1220'}
                />
              </div>
            </>
          ) : (
            <Empty
              action={
                <Button size="sm" onClick={() => onNavigate('settings')}>
                  Choose one in Settings
                </Button>
              }
            >
              No North Star metric is set. Mark one activity as your North Star to see it here.
            </Empty>
          )}
        </div>

        {/* ---- streak + week summary ----------------------------------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div className="card flex flex-col justify-center p-4">
            <p className="eyebrow flex items-center gap-1">
              <Icon name="flame" size={12} /> Streak
            </p>
            <p className="tabular mt-1 text-3xl leading-none font-semibold">
              {snap.streak}
              <span className="ml-1 text-sm font-normal text-ink-3">
                {snap.streak === 1 ? 'day' : 'days'}
              </span>
            </p>
            <p className="mt-1 text-xs text-ink-3">
              {snap.streak === 0 ? 'Log anything today to start one.' : `Best: ${best} days`}
            </p>
          </div>
          <div className="card flex flex-col justify-center p-4">
            <p className="eyebrow">Targets hit</p>
            <p className="tabular mt-1 text-3xl leading-none font-semibold">
              {summary.hit}
              <span className="text-sm font-normal text-ink-3">/{summary.total}</span>
            </p>
            <p className="mt-1 text-xs text-ink-3">{summary.pct}% of total weekly volume</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {/* ---- progress bars ------------------------------------------- */}
        <Card
          title={`This week · ${week.label}`}
          className="lg:col-span-2"
          bodyClass="p-0"
          action={
            <Button size="sm" onClick={() => onNavigate('log')}>
              <Icon name="plus" /> Log today
            </Button>
          }
        >
          {nothingConfigured ? (
            <Empty
              action={
                <Button size="sm" onClick={() => onNavigate('settings')}>
                  Add tracks and activities
                </Button>
              }
            >
              No activities yet.
            </Empty>
          ) : rows.length === 0 ? (
            <Empty
              action={
                <Button size="sm" onClick={() => onNavigate('settings')}>
                  Open Settings
                </Button>
              }
            >
              Every track is switched off. Reactivate one to see progress here.
            </Empty>
          ) : (
            <div className="divide-y divide-line">
              {byTrack.map((group) => (
                <div key={group.track?.id || 'none'} className="px-3 py-2.5 sm:px-4">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-2">
                    <Dot color={group.track?.color} />
                    {group.track?.name || 'No track'}
                  </p>
                  <div className="space-y-2.5">
                    {group.rows.map((row) => (
                      <ProgressRow key={row.activity.id} row={row} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ---- follow-ups due ------------------------------------------ */}
        <Card
          title="Follow-ups due"
          bodyClass="p-0"
          action={
            <Button size="sm" onClick={() => onNavigate('pipeline')}>
              Pipeline
            </Button>
          }
        >
          {snap.dueFollowUps.length === 0 ? (
            <Empty>Nothing due. {state.pipeline.length === 0 && 'Add contacts in Pipeline.'}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {snap.dueFollowUps.map((item) => {
                const overdue = item.nextFollowUpDate < today
                return (
                  <li key={item.id} className="flex items-start justify-between gap-2 px-3 py-2 sm:px-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.company || item.contactName || 'Unnamed'}
                      </p>
                      <p className="truncate text-xs text-ink-3">
                        {[item.contactName && item.company ? item.contactName : null, item.status]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <Badge tone={overdue ? 'bad' : 'warn'}>
                      {relativeDayLabel(item.nextFollowUpDate, today)}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* ---- milestones + at-a-glance pipeline -------------------------- */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card title={`Week ${week.week} milestones`} bodyClass="p-0" className="lg:col-span-2">
          {snap.milestones.length === 0 ? (
            <Empty>No milestone set for this week.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {snap.milestones.map((m) => (
                <li key={m.id} className="flex items-start gap-2 px-3 py-2 sm:px-4">
                  <input
                    type="checkbox"
                    checked={m.done}
                    onChange={(e) => actions.updateMilestone(m.id, { done: e.target.checked })}
                    className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
                  />
                  <span className={`text-sm ${m.done ? 'text-ink-3 line-through' : ''}`}>
                    {m.description}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Pipeline this week">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Stat label="New contacts" value={snap.movement.newContacts} />
            <Stat label="Replies" value={snap.movement.replies} />
            <Stat label="To screening+" value={snap.movement.advanced} />
            <Stat label="Active convos" value={snap.movement.active} />
            <Stat
              label="Overdue"
              value={snap.movement.overdue}
              tone={snap.movement.overdue > 0 ? 'bad' : undefined}
            />
            <Stat label="Total contacts" value={snap.movement.total} />
          </dl>
        </Card>
      </div>
    </div>
  )
}

function ProgressRow({ row }) {
  const { activity, track, target, actual, pct, hit } = row
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate">{activity.name}</span>
        <span className="tabular shrink-0 text-xs text-ink-2">
          <span className={hit ? 'font-semibold text-ok' : 'font-semibold text-ink'}>{actual}</span>
          <span className="text-ink-3">/{target}</span>
          <span className="ml-1.5 inline-block w-9 text-right text-ink-3">{pct}%</span>
        </span>
      </div>
      <div className="mt-1">
        <ProgressBar value={actual} max={target} color={track?.color} />
      </div>
    </div>
  )
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`tabular text-lg leading-tight font-semibold ${tone === 'bad' ? 'text-bad' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
