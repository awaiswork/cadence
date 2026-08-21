/**
 * Pipeline — every outreach conversation, sortable and filterable.
 *
 * Layout: a dense table on desktop, stacked cards on mobile. Both share one
 * editor panel (`ItemEditor`) that opens inline under the row being edited, so
 * there is a single place where field markup lives.
 *
 * Rows whose follow-up is due today or overdue are tinted; that highlight is
 * the reason to open this screen at all, so it takes precedence over selection.
 */

import { useMemo, useState } from 'react'
import { useStore } from '../data/storeContext.js'
import { PIPELINE_STATUSES, uid } from '../data/schema.js'
import { isActiveConversation, overdueByDays, statusCounts } from '../lib/metrics.js'
import { formatDate, relativeDayLabel, todayISO } from '../lib/dates.js'
import {
  Badge,
  Button,
  ConfirmButton,
  Empty,
  Field,
  Icon,
  Input,
  Select,
  Textarea,
} from '../components/ui.jsx'

/** Column definitions drive both the header row and the sort menu. */
const COLUMNS = [
  { key: 'company', label: 'Company', sortable: true },
  { key: 'contactName', label: 'Contact', sortable: true },
  { key: 'role', label: 'Role', sortable: true },
  { key: 'channel', label: 'Channel', sortable: true },
  { key: 'dateContacted', label: 'Contacted', sortable: true, numeric: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'nextFollowUpDate', label: 'Follow-up', sortable: true, numeric: true },
]

/** Tone for a status badge: green once won, red once lost, amber mid-funnel. */
function statusTone(status) {
  if (status === 'Closed-Won') return 'ok'
  if (status === 'Closed-Lost') return 'neutral'
  if (['Screening', 'Interview', 'Offer'].includes(status)) return 'warn'
  return 'neutral'
}

export default function Pipeline({ today = todayISO() }) {
  const { state, actions } = useStore()
  const [filters, setFilters] = useState({ status: 'all', channel: 'all', q: '', due: false })
  const [sort, setSort] = useState({ key: 'nextFollowUpDate', dir: 'asc' })
  const [editingId, setEditingId] = useState(null)

  const counts = useMemo(() => statusCounts(state), [state])
  const channels = useMemo(() => {
    const used = new Set(state.pipeline.map((p) => p.channel).filter(Boolean))
    return [...new Set([...state.settings.channels, ...used])].sort()
  }, [state.pipeline, state.settings.channels])

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    const rows = state.pipeline.filter((item) => {
      if (filters.status !== 'all' && item.status !== filters.status) return false
      if (filters.channel !== 'all' && item.channel !== filters.channel) return false
      if (filters.due && !(isActiveConversation(item) && item.nextFollowUpDate && item.nextFollowUpDate <= today))
        return false
      if (!q) return true
      return [item.company, item.contactName, item.role, item.channel, item.notes]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q))
    })

    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = a[sort.key] ?? ''
      const bv = b[sort.key] ?? ''
      // Empty values always sort last, whichever direction — a row with no
      // follow-up date should never sit above one that needs attention.
      if (av === '' && bv === '') return 0
      if (av === '') return 1
      if (bv === '') return -1
      if (sort.key === 'status') return (PIPELINE_STATUSES.indexOf(av) - PIPELINE_STATUSES.indexOf(bv)) * dir
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * dir
    })
  }, [state.pipeline, filters, sort, today])

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const addItem = () => {
    // Mint the id here so the new row can be opened for editing immediately —
    // dispatch has no return value to hand one back.
    const id = uid('pip')
    actions.addPipelineItem({ id, dateContacted: today, status: 'Contacted', channel: '' })
    // Clear filters, otherwise the brand-new empty row may not match them.
    setFilters({ status: 'all', channel: 'all', q: '', due: false })
    setEditingId(id)
  }

  const dueCount = state.pipeline.filter(
    (p) => isActiveConversation(p) && p.nextFollowUpDate && p.nextFollowUpDate <= today,
  ).length

  return (
    <div className="space-y-3">
      {/* ---- status summary --------------------------------------------- */}
      <div className="card flex flex-wrap items-center gap-1.5 p-2.5">
        <SummaryChip
          label="All"
          count={state.pipeline.length}
          active={filters.status === 'all' && !filters.due}
          onClick={() => setFilters((f) => ({ ...f, status: 'all', due: false }))}
        />
        {PIPELINE_STATUSES.map((status) => (
          <SummaryChip
            key={status}
            label={status}
            count={counts[status] || 0}
            active={filters.status === status}
            onClick={() =>
              setFilters((f) => ({ ...f, status: f.status === status ? 'all' : status, due: false }))
            }
          />
        ))}
        <SummaryChip
          label="Due / overdue"
          count={dueCount}
          tone={dueCount > 0 ? 'bad' : undefined}
          active={filters.due}
          onClick={() => setFilters((f) => ({ ...f, due: !f.due, status: 'all' }))}
        />
      </div>

      {/* ---- filters ------------------------------------------------------ */}
      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <Input
          type="search"
          placeholder="Search company, contact, role, notes…"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          className="field min-w-40 flex-1"
        />
        <Select
          value={filters.channel}
          onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
          aria-label="Filter by channel"
          style={{ width: 'auto' }}
        >
          <option value="all">All channels</option>
          {channels.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <Select
          value={`${sort.key}:${sort.dir}`}
          onChange={(e) => {
            const [key, dir] = e.target.value.split(':')
            setSort({ key, dir })
          }}
          aria-label="Sort by"
          className="field sm:hidden"
          style={{ width: 'auto' }}
        >
          {COLUMNS.map((c) => (
            <option key={c.key} value={`${c.key}:asc`}>
              {c.label} ↑
            </option>
          ))}
        </Select>
        <Button variant="primary" onClick={addItem}>
          <Icon name="plus" /> Add contact
        </Button>
      </div>

      {/* ---- table (desktop) ---------------------------------------------- */}
      <div className="card overflow-hidden">
        {state.pipeline.length === 0 ? (
          <Empty action={<Button size="sm" variant="primary" onClick={addItem}>Add your first contact</Button>}>
            No contacts yet. Every cold email, application and DM that gets a name goes here.
          </Empty>
        ) : visible.length === 0 ? (
          <Empty
            action={
              <Button size="sm" onClick={() => setFilters({ status: 'all', channel: 'all', q: '', due: false })}>
                Clear filters
              </Button>
            }
          >
            No contacts match these filters.
          </Empty>
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {COLUMNS.map((col) => (
                      <th key={col.key} className="px-2.5 py-2 font-medium">
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className="eyebrow flex items-center gap-1 hover:text-ink"
                        >
                          {col.label}
                          {sort.key === col.key && (
                            <Icon name={sort.dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={11} />
                          )}
                        </button>
                      </th>
                    ))}
                    <th className="w-20 px-2.5 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((item) => (
                    <TableRow
                      key={item.id}
                      item={item}
                      today={today}
                      editing={editingId === item.id}
                      onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                      onClose={() => setEditingId(null)}
                      channels={channels}
                      actions={actions}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* ---- cards (mobile) ------------------------------------------ */}
            <ul className="divide-y divide-line sm:hidden">
              {visible.map((item) => (
                <MobileCard
                  key={item.id}
                  item={item}
                  today={today}
                  editing={editingId === item.id}
                  onEdit={() => setEditingId(editingId === item.id ? null : item.id)}
                  onClose={() => setEditingId(null)}
                  channels={channels}
                  actions={actions}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {visible.length > 0 && (
        <p className="px-1 text-xs text-ink-3">
          Showing {visible.length} of {state.pipeline.length} contacts.
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function SummaryChip({ label, count, active, onClick, tone }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
        active
          ? 'border-ink bg-ink text-white'
          : tone === 'bad'
            ? 'border-bad/30 bg-bad-bg text-bad hover:border-bad'
            : 'border-line bg-surface text-ink-2 hover:bg-canvas'
      }`}
    >
      <span>{label}</span>
      <span className="tabular font-semibold">{count}</span>
    </button>
  )
}

/** Shared row tint for follow-ups that need action. */
function rowTint(item, today) {
  if (!isActiveConversation(item) || !item.nextFollowUpDate) return ''
  if (item.nextFollowUpDate < today) return 'bg-bad-bg'
  if (item.nextFollowUpDate === today) return 'bg-warn-bg'
  return ''
}

function FollowUpCell({ item, today }) {
  if (!item.nextFollowUpDate) return <span className="text-ink-3">—</span>
  const days = overdueByDays(item, today)
  const due = isActiveConversation(item) && item.nextFollowUpDate <= today
  return (
    <span className={due ? 'font-medium' : ''}>
      {formatDate(item.nextFollowUpDate, { year: false })}
      {due && (
        <span className={`ml-1.5 text-xs ${days > 0 ? 'text-bad' : 'text-warn'}`}>
          {relativeDayLabel(item.nextFollowUpDate, today)}
        </span>
      )}
    </span>
  )
}

function TableRow({ item, today, editing, onEdit, onClose, channels, actions }) {
  return (
    <>
      <tr className={rowTint(item, today)}>
        <td className="px-2.5 py-2 font-medium">{item.company || <span className="text-ink-3">Unnamed</span>}</td>
        <td className="px-2.5 py-2">{item.contactName || <span className="text-ink-3">—</span>}</td>
        <td className="px-2.5 py-2 text-ink-2">{item.role || <span className="text-ink-3">—</span>}</td>
        <td className="px-2.5 py-2 text-ink-2">{item.channel || <span className="text-ink-3">—</span>}</td>
        <td className="tabular px-2.5 py-2 text-ink-2">
          {item.dateContacted ? formatDate(item.dateContacted, { year: false }) : '—'}
        </td>
        <td className="px-2.5 py-2">
          <Badge tone={statusTone(item.status)}>{item.status}</Badge>
        </td>
        <td className="tabular px-2.5 py-2">
          <FollowUpCell item={item} today={today} />
        </td>
        <td className="px-2.5 py-2 text-right">
          <Button size="sm" onClick={onEdit} aria-label={`Edit ${item.company || 'contact'}`}>
            <Icon name="pencil" />
          </Button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={COLUMNS.length + 1} className="bg-canvas px-2.5 py-3">
            <ItemEditor item={item} channels={channels} actions={actions} onClose={onClose} today={today} />
          </td>
        </tr>
      )}
      {!editing && item.notes && (
        <tr className={rowTint(item, today)}>
          <td colSpan={COLUMNS.length + 1} className="px-2.5 pb-2 text-xs text-ink-3 italic">
            {item.notes}
          </td>
        </tr>
      )}
    </>
  )
}

function MobileCard({ item, today, editing, onEdit, onClose, channels, actions }) {
  return (
    <li className={`px-3 py-2.5 ${rowTint(item, today)}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.company || 'Unnamed'}</p>
          <p className="truncate text-xs text-ink-3">
            {[item.contactName, item.role, item.channel].filter(Boolean).join(' · ') || '—'}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone(item.status)}>{item.status}</Badge>
            {item.nextFollowUpDate && (
              <Badge
                tone={
                  isActiveConversation(item) && item.nextFollowUpDate < today
                    ? 'bad'
                    : isActiveConversation(item) && item.nextFollowUpDate === today
                      ? 'warn'
                      : 'neutral'
                }
              >
                {formatDate(item.nextFollowUpDate, { year: false })}
              </Badge>
            )}
          </div>
        </div>
        <Button size="sm" onClick={onEdit} aria-label={`Edit ${item.company || 'contact'}`}>
          <Icon name="pencil" />
        </Button>
      </div>
      {editing && (
        <div className="mt-2.5">
          <ItemEditor item={item} channels={channels} actions={actions} onClose={onClose} today={today} />
        </div>
      )}
    </li>
  )
}

/**
 * Inline editor. Edits are applied immediately (no save button) so there is no
 * unsaved-state to lose; "Done" just collapses the panel.
 *
 * Status changes are dated `today` by the reducer, which is what feeds the
 * weekly "replies received" and "moved to screening" counts.
 */
function ItemEditor({ item, channels, actions, onClose, today }) {
  const set = (patch) => actions.updatePipelineItem(item.id, patch, today)
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
        <Field label="Company">
          <Input value={item.company} onChange={(e) => set({ company: e.target.value })} placeholder="Acme Oy" />
        </Field>
        <Field label="Contact name">
          <Input value={item.contactName} onChange={(e) => set({ contactName: e.target.value })} placeholder="Jane Doe" />
        </Field>
        <Field label="Role">
          <Input value={item.role} onChange={(e) => set({ role: e.target.value })} placeholder="Senior Backend" />
        </Field>
        <Field label="Channel">
          <Input
            value={item.channel}
            onChange={(e) => set({ channel: e.target.value })}
            list="pipeline-channels"
            placeholder="Cold email"
          />
          <datalist id="pipeline-channels">
            {channels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Date contacted">
          <Input type="date" value={item.dateContacted || ''} onChange={(e) => set({ dateContacted: e.target.value })} />
        </Field>
        <Field label="Status">
          <Select value={item.status} onChange={(e) => set({ status: e.target.value })}>
            {PIPELINE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Next follow-up">
          <Input
            type="date"
            value={item.nextFollowUpDate || ''}
            onChange={(e) => set({ nextFollowUpDate: e.target.value })}
          />
        </Field>
        <div className="flex items-end">
          <div className="flex w-full gap-1.5">
            <Button size="sm" onClick={() => set({ nextFollowUpDate: addBusinessDays(today, 3) })} className="flex-1">
              +3d
            </Button>
            <Button size="sm" onClick={() => set({ nextFollowUpDate: addBusinessDays(today, 7) })} className="flex-1">
              +1w
            </Button>
          </div>
        </div>
        <Field label="Notes" className="sm:col-span-4">
          <Textarea rows={2} value={item.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="What was said, what to say next…" />
        </Field>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <ConfirmButton size="sm" onConfirm={() => actions.deletePipelineItem(item.id)}>
          <Icon name="trash" /> Delete
        </ConfirmButton>
        <Button size="sm" variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  )
}

/** Follow-up shortcuts skip weekends — nobody replies to a Saturday nudge. */
function addBusinessDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  let left = days
  while (left > 0) {
    date.setDate(date.getDate() + 1)
    if (date.getDay() !== 0 && date.getDay() !== 6) left--
  }
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
}
