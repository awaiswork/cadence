/**
 * checkin.js — renders the weekly check-in markdown.
 * =============================================================================
 * One exported function, `generateCheckin(state, weekNumber, today)`, returning
 * a markdown string. It reads exclusively from metrics.js, so the numbers here
 * are the same ones on screen.
 *
 * The output format is fixed by hand (not a template library) because it is
 * pasted into a conversation and the exact headings matter. If you change a
 * heading, change it here — nothing else depends on the text.
 */

import { weekSnapshot } from './metrics.js'
import { todayISO } from './dates.js'

/** Escape pipes so a stray `|` in an activity name can't break a table row. */
const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').trim()

/** Free-text fields fall back to a visible placeholder rather than an empty bullet. */
const orDash = (value) => {
  const text = String(value ?? '').trim()
  return text === '' ? '—' : text.replace(/\s*\n\s*/g, ' ')
}

export function generateCheckin(state, weekNumber, today = todayISO()) {
  const snap = weekSnapshot(state, weekNumber, today)
  const { week, rows, movement, milestones, review, flags } = snap
  const lines = []

  lines.push(`## Week ${week.week} Check-in — ${week.label}`)
  lines.push('')

  // --- North Star ----------------------------------------------------------
  const northStarName = snap.northStar ? snap.northStar.name : 'Not set'
  lines.push(`**North Star:** ${northStarName}: ${snap.northStarActual} / ${snap.northStarTarget}`)
  lines.push('')

  // --- Activity vs target --------------------------------------------------
  lines.push('### Activity vs target')
  lines.push('')
  lines.push('| Track | Activity | Target | Actual | % |')
  lines.push('| --- | --- | ---: | ---: | ---: |')
  if (rows.length === 0) {
    lines.push('| — | No active activities | — | — | — |')
  } else {
    for (const row of rows) {
      lines.push(
        `| ${cell(row.track?.name || '—')} | ${cell(row.activity.name)} | ${row.target} | ${row.actual} | ${row.pct}% |`,
      )
    }
  }
  lines.push('')

  // --- Pipeline movement ---------------------------------------------------
  lines.push('### Pipeline movement')
  lines.push('')
  lines.push(`- New contacts this week: ${movement.newContacts}`)
  lines.push(`- Replies received: ${movement.replies}`)
  lines.push(`- Moved to screening or beyond: ${movement.advanced}`)
  lines.push(`- Currently active conversations: ${movement.active}`)
  lines.push(`- Overdue follow-ups: ${movement.overdue}`)
  lines.push('')

  // --- Milestones ----------------------------------------------------------
  lines.push('### Milestones')
  lines.push('')
  if (milestones.length === 0) {
    lines.push(`- No milestone set for week ${week.week}`)
  } else {
    for (const milestone of milestones) {
      lines.push(`- ${milestone.description}: ${milestone.done ? 'done' : 'not done'}`)
    }
  }
  lines.push('')

  // --- Notes ---------------------------------------------------------------
  lines.push('### Notes')
  lines.push('')
  lines.push(`- What worked: ${orDash(review.worked)}`)
  lines.push(`- What blocked me: ${orDash(review.blocked)}`)
  lines.push(`- One change for next week: ${orDash(review.change)}`)
  lines.push('')

  // --- Flags ---------------------------------------------------------------
  lines.push('### Flags')
  lines.push('')
  if (flags.length === 0) {
    lines.push('None.')
  } else {
    for (const flag of flags) lines.push(`- ${flag.text}`)
  }

  return lines.join('\n')
}

/**
 * Copy text to the clipboard, with a fallback for non-secure contexts
 * (the async Clipboard API is unavailable on plain http:// origins other than
 * localhost — which matters if you open the app from your phone over LAN).
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-9999px'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
