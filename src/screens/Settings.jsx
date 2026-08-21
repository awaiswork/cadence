/**
 * Settings — the extensibility surface.
 *
 * Everything the rest of the app renders is configured here: sprint dates,
 * tracks, activities, targets, milestones, plus export / import / reset.
 * Nothing in this screen is special-cased for the seed data — adding a fifth
 * track works exactly like editing the first.
 */

import { useMemo, useRef, useState } from 'react'
import { useStore } from '../data/storeContext.js'
import { downloadExport, importJSON, STORAGE_KEY } from '../data/storage.js'
import { sortedTracks, sortedActivities } from '../lib/metrics.js'
import { currentSprintWeek, formatRange, sprintWeekRange, startOfWeek } from '../lib/dates.js'
import {
  Badge,
  Button,
  Card,
  Check,
  ConfirmButton,
  Dot,
  Empty,
  Field,
  Icon,
  Input,
  Modal,
  Select,
} from '../components/ui.jsx'

export default function Settings({ today }) {
  const { state, actions } = useStore()
  const tracks = useMemo(() => sortedTracks(state), [state])
  const activities = useMemo(() => sortedActivities(state), [state])

  const weekNumber = currentSprintWeek(state.settings.sprintStartDate, today)
  const week1 = sprintWeekRange(1, state.settings.sprintStartDate)
  const lastWeek = sprintWeekRange(state.settings.sprintWeeks, state.settings.sprintStartDate)

  return (
    <div className="space-y-3">
      {/* ---- sprint ------------------------------------------------------- */}
      <Card title="Sprint">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Sprint start date"
            hint={`Week 1 runs ${week1.label}. Weeks run Monday to Sunday, so the start date snaps to its Monday.`}
          >
            <Input
              type="date"
              value={state.settings.sprintStartDate}
              onChange={(e) =>
                e.target.value && actions.setSettings({ sprintStartDate: startOfWeek(e.target.value) })
              }
            />
          </Field>
          <Field label="Sprint length (weeks)" hint={`Ends ${lastWeek.label}.`}>
            <Input
              type="number"
              min="1"
              max="52"
              value={state.settings.sprintWeeks}
              onChange={(e) =>
                actions.setSettings({ sprintWeeks: Math.max(1, Number(e.target.value) || 1) })
              }
            />
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-md border border-line bg-canvas px-3 py-2">
              <p className="eyebrow">Currently</p>
              <p className="mt-0.5 text-sm font-medium">
                Week {weekNumber} of {state.settings.sprintWeeks}
              </p>
              <p className="text-xs text-ink-3">
                {formatRange(
                  sprintWeekRange(weekNumber, state.settings.sprintStartDate).start,
                  sprintWeekRange(weekNumber, state.settings.sprintStartDate).end,
                )}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <TracksCard tracks={tracks} activities={activities} actions={actions} />
      <ActivitiesCard tracks={tracks} activities={activities} actions={actions} state={state} />
      <MilestonesCard state={state} actions={actions} />
      <DataCard state={state} actions={actions} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* tracks                                                                     */
/* -------------------------------------------------------------------------- */

function TracksCard({ tracks, activities, actions }) {
  const [name, setName] = useState('')

  const add = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    actions.addTrack({ name: trimmed })
    setName('')
  }

  return (
    <Card
      title="Tracks"
      bodyClass="p-0"
      action={<span className="text-xs text-ink-3">{tracks.length} total</span>}
    >
      {tracks.length === 0 ? (
        <Empty>No tracks yet. Add one below to start.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {tracks.map((track, i) => {
            const count = activities.filter((a) => a.trackId === track.id).length
            return (
              <li key={track.id} className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
                <div className="flex shrink-0 flex-col">
                  <button
                    type="button"
                    onClick={() => actions.moveTrack(track.id, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${track.name} up`}
                    className="text-ink-3 hover:text-ink disabled:opacity-25"
                  >
                    <Icon name="chevronUp" size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => actions.moveTrack(track.id, 1)}
                    disabled={i === tracks.length - 1}
                    aria-label={`Move ${track.name} down`}
                    className="text-ink-3 hover:text-ink disabled:opacity-25"
                  >
                    <Icon name="chevronDown" size={12} />
                  </button>
                </div>

                <input
                  type="color"
                  value={track.color}
                  onChange={(e) => actions.updateTrack(track.id, { color: e.target.value })}
                  aria-label={`Colour for ${track.name}`}
                  title="Track colour"
                  className="size-7 shrink-0 cursor-pointer rounded border border-line bg-surface p-0.5"
                />

                <Input
                  value={track.name}
                  onChange={(e) => actions.updateTrack(track.id, { name: e.target.value })}
                  aria-label="Track name"
                  className="min-w-32 flex-1"
                />

                <span className="hidden w-24 shrink-0 text-xs text-ink-3 sm:inline">
                  {count} {count === 1 ? 'activity' : 'activities'}
                </span>

                <Check
                  checked={track.active}
                  onChange={(checked) => actions.updateTrack(track.id, { active: checked })}
                  className="shrink-0"
                >
                  <span className="text-xs text-ink-2">Active</span>
                </Check>

                <ConfirmButton
                  size="sm"
                  onConfirm={() => actions.deleteTrack(track.id)}
                  confirmLabel={count > 0 ? `Delete ${count} too?` : 'Sure?'}
                  aria-label={`Delete ${track.name}`}
                >
                  <Icon name="trash" />
                </ConfirmButton>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex gap-1.5 border-t border-line p-2.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New track name"
        />
        <Button variant="primary" onClick={add} disabled={!name.trim()}>
          <Icon name="plus" /> Add track
        </Button>
      </div>
      <p className="border-t border-line px-3 py-2 text-xs text-ink-3 sm:px-4">
        Switching a track off hides its activities from the dashboard, daily log and check-in but
        keeps every log entry. Deleting a track deletes its activities and their history.
      </p>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* activities                                                                 */
/* -------------------------------------------------------------------------- */

function ActivitiesCard({ tracks, activities, actions, state }) {
  const [draft, setDraft] = useState(null) // null | {trackId, name, weeklyTarget, unit}

  const openNew = () =>
    setDraft({ trackId: tracks[0]?.id || '', name: '', weeklyTarget: 1, unit: '', isNorthStar: false })

  const save = () => {
    const name = draft.name.trim()
    if (!name || !draft.trackId) return
    actions.addActivity({
      trackId: draft.trackId,
      name,
      weeklyTarget: Math.max(0, Number(draft.weeklyTarget) || 0),
      unit: draft.unit.trim(),
      isNorthStar: draft.isNorthStar,
    })
    setDraft(null)
  }

  return (
    <Card
      title="Activities"
      bodyClass="p-0"
      action={
        <Button size="sm" variant="primary" onClick={openNew} disabled={tracks.length === 0}>
          <Icon name="plus" /> Add activity
        </Button>
      }
    >
      {activities.length === 0 ? (
        <Empty>
          {tracks.length === 0
            ? 'Add a track first, then activities to measure inside it.'
            : 'No activities yet.'}
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {activities.map((activity) => {
            const track = tracks.find((t) => t.id === activity.trackId)
            const siblings = activities.filter((a) => a.trackId === activity.trackId)
            const indexInTrack = siblings.findIndex((a) => a.id === activity.id)
            const logCount = state.logs.filter((l) => l.activityId === activity.id).length
            return (
              <li key={activity.id} className="px-3 py-2 sm:px-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => actions.moveActivity(activity.id, -1)}
                      disabled={indexInTrack === 0}
                      aria-label="Move up"
                      className="text-ink-3 hover:text-ink disabled:opacity-25"
                    >
                      <Icon name="chevronUp" size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => actions.moveActivity(activity.id, 1)}
                      disabled={indexInTrack === siblings.length - 1}
                      aria-label="Move down"
                      className="text-ink-3 hover:text-ink disabled:opacity-25"
                    >
                      <Icon name="chevronDown" size={12} />
                    </button>
                  </div>

                  <Input
                    value={activity.name}
                    onChange={(e) => actions.updateActivity(activity.id, { name: e.target.value })}
                    aria-label="Activity name"
                    className="min-w-36 flex-1"
                  />

                  <Select
                    value={activity.trackId}
                    onChange={(e) => actions.updateActivity(activity.id, { trackId: e.target.value })}
                    aria-label="Track"
                    className="w-40 shrink-0"
                  >
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>

                  <label className="flex shrink-0 items-center gap-1">
                    <span className="text-xs text-ink-3">Target</span>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={activity.weeklyTarget}
                      onChange={(e) =>
                        actions.updateActivity(activity.id, {
                          weeklyTarget: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      aria-label={`Weekly target for ${activity.name}`}
                      className="tabular w-16 text-center"
                    />
                  </label>

                  <Input
                    value={activity.unit}
                    onChange={(e) => actions.updateActivity(activity.id, { unit: e.target.value })}
                    placeholder="unit"
                    aria-label="Unit"
                    className="w-20 shrink-0"
                  />

                  <ConfirmButton
                    size="sm"
                    onConfirm={() => actions.deleteActivity(activity.id)}
                    confirmLabel={logCount > 0 ? `Lose ${logCount} logs?` : 'Sure?'}
                    aria-label={`Delete ${activity.name}`}
                  >
                    <Icon name="trash" />
                  </ConfirmButton>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-3 pl-5 text-xs">
                  <Dot color={track?.color} />
                  <Check
                    checked={activity.active}
                    onChange={(checked) => actions.updateActivity(activity.id, { active: checked })}
                  >
                    <span className="text-xs text-ink-2">Active</span>
                  </Check>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="north-star"
                      checked={activity.isNorthStar}
                      onChange={() => actions.updateActivity(activity.id, { isNorthStar: true })}
                      className="size-3.5 accent-[var(--color-ink)]"
                    />
                    <span className="text-xs text-ink-2">North Star</span>
                  </label>
                  {activity.isNorthStar && <Badge tone="ok">Headline metric</Badge>}
                  {!track?.active && <Badge tone="warn">Track is off</Badge>}
                  <span className="text-ink-3">
                    {logCount} {logCount === 1 ? 'entry' : 'entries'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal
        open={!!draft}
        title="Add activity"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={!draft?.name.trim()}>
              Add activity
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-3">
            <Field label="Name">
              <Input
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="e.g. Portfolio case studies written"
              />
            </Field>
            <Field label="Track">
              <Select value={draft.trackId} onChange={(e) => setDraft({ ...draft, trackId: e.target.value })}>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weekly target">
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={draft.weeklyTarget}
                  onChange={(e) => setDraft({ ...draft, weeklyTarget: e.target.value })}
                />
              </Field>
              <Field label="Unit" hint="Cosmetic, e.g. emails or hours.">
                <Input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
              </Field>
            </div>
            <Check
              checked={draft.isNorthStar}
              onChange={(checked) => setDraft({ ...draft, isNorthStar: checked })}
            >
              Make this the North Star metric
              <span className="block text-xs text-ink-3">
                Replaces the current one — there is only ever one.
              </span>
            </Check>
          </div>
        )}
      </Modal>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* milestones                                                                 */
/* -------------------------------------------------------------------------- */

function MilestonesCard({ state, actions }) {
  const [draft, setDraft] = useState({ weekNumber: 1, description: '' })
  const milestones = useMemo(
    () => [...state.milestones].sort((a, b) => a.weekNumber - b.weekNumber),
    [state.milestones],
  )

  const add = () => {
    const description = draft.description.trim()
    if (!description) return
    actions.addMilestone({ weekNumber: Number(draft.weekNumber) || 1, description })
    setDraft({ ...draft, description: '' })
  }

  return (
    <Card title="Milestones" bodyClass="p-0">
      {milestones.length === 0 ? (
        <Empty>No milestones yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {milestones.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
              <label className="flex shrink-0 items-center gap-1">
                <span className="text-xs text-ink-3">Week</span>
                <Input
                  type="number"
                  min="1"
                  value={m.weekNumber}
                  onChange={(e) =>
                    actions.updateMilestone(m.id, { weekNumber: Math.max(1, Number(e.target.value) || 1) })
                  }
                  aria-label="Week number"
                  className="tabular w-14 text-center"
                />
              </label>
              <Input
                value={m.description}
                onChange={(e) => actions.updateMilestone(m.id, { description: e.target.value })}
                aria-label="Milestone description"
                className="min-w-40 flex-1"
              />
              <Check checked={m.done} onChange={(checked) => actions.updateMilestone(m.id, { done: checked })}>
                <span className="text-xs text-ink-2">Done</span>
              </Check>
              <ConfirmButton size="sm" onConfirm={() => actions.deleteMilestone(m.id)} aria-label="Delete milestone">
                <Icon name="trash" />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1.5 border-t border-line p-2.5">
        <Input
          type="number"
          min="1"
          value={draft.weekNumber}
          onChange={(e) => setDraft({ ...draft, weekNumber: e.target.value })}
          aria-label="Week number for new milestone"
          className="tabular w-16 text-center"
        />
        <Input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="New milestone"
          className="min-w-40 flex-1"
        />
        <Button variant="primary" onClick={add} disabled={!draft.description.trim()}>
          <Icon name="plus" /> Add
        </Button>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* data: export / import / reset                                              */
/* -------------------------------------------------------------------------- */

function DataCard({ state, actions }) {
  const fileRef = useRef(null)
  const [message, setMessage] = useState(null) // { tone, text }
  const [resetOpen, setResetOpen] = useState(false)
  const [resetSeed, setResetSeed] = useState(true)
  const [confirmText, setConfirmText] = useState('')

  const counts = {
    tracks: state.tracks.length,
    activities: state.activities.length,
    logs: state.logs.length,
    pipeline: state.pipeline.length,
    milestones: state.milestones.length,
  }

  const onFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = '' // let the same file be picked again after a failure
    if (!file) return
    try {
      const next = importJSON(await file.text())
      actions.setState(next)
      setMessage({
        tone: 'ok',
        text: `Imported ${next.tracks.length} tracks, ${next.activities.length} activities, ${next.logs.length} log entries and ${next.pipeline.length} contacts.`,
      })
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    }
  }

  const doReset = () => {
    actions.reset({ seed: resetSeed })
    setResetOpen(false)
    setConfirmText('')
    setMessage({ tone: 'ok', text: resetSeed ? 'Reset to the starting setup.' : 'All data cleared.' })
  }

  return (
    <Card title="Data">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => downloadExport(state)}>
          <Icon name="download" /> Export JSON
        </Button>
        <Button onClick={() => fileRef.current?.click()}>
          <Icon name="upload" /> Import JSON
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
        <Button variant="danger" onClick={() => setResetOpen(true)}>
          <Icon name="trash" /> Reset all data
        </Button>
        <span className="ml-auto text-xs text-ink-3">
          {counts.tracks} tracks · {counts.activities} activities · {counts.logs} logs ·{' '}
          {counts.pipeline} contacts · {counts.milestones} milestones
        </span>
      </div>

      {message && (
        <p
          className={`mt-2.5 rounded-md border px-2.5 py-2 text-xs ${
            message.tone === 'ok' ? 'border-ok/25 bg-ok-bg text-ok' : 'border-bad/25 bg-bad-bg text-bad'
          }`}
        >
          {message.text}
        </p>
      )}

      <p className="mt-2.5 text-xs text-ink-3">
        Everything lives in this browser under <code className="font-mono">{STORAGE_KEY}</code>.
        Clearing site data wipes it, so export before switching browsers or clearing history.
        Importing replaces everything currently stored.
      </p>

      <Modal
        open={resetOpen}
        title="Reset all data"
        onClose={() => setResetOpen(false)}
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={doReset} disabled={confirmText.trim().toUpperCase() !== 'RESET'}>
              Reset everything
            </Button>
          </>
        }
      >
        <p className="text-sm">
          This deletes all {counts.logs} log entries, {counts.pipeline} pipeline contacts and your
          whole configuration. It cannot be undone.
        </p>
        <div className="mt-3">
          <Button size="sm" onClick={() => downloadExport(state)}>
            <Icon name="download" /> Export a backup first
          </Button>
        </div>
        <div className="mt-3 space-y-2">
          <Check checked={resetSeed} onChange={setResetSeed}>
            Start again from the default tracks and activities
            <span className="block text-xs text-ink-3">Unchecked: start completely empty.</span>
          </Check>
          <Field label="Type RESET to confirm">
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="RESET"
              autoComplete="off"
            />
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
