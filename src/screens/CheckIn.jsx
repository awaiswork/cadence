/**
 * Check-in Generator — produces the markdown summary to paste into coaching.
 *
 * The markdown itself is built by lib/checkin.js; this screen is the button,
 * the preview, and the week selector. Generation is explicit (a button rather
 * than live-updating) so what you copy is exactly what you reviewed — but the
 * preview marks itself stale if the underlying data changes afterwards.
 */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../data/storeContext.js'
import { copyToClipboard, generateCheckin } from '../lib/checkin.js'
import { currentSprintWeek, sprintWeeks } from '../lib/dates.js'
import { Badge, Button, Card, Icon, Select } from '../components/ui.jsx'

export default function CheckIn({ today, onNavigate }) {
  const { state } = useStore()
  const weeks = useMemo(() => sprintWeeks(state.settings, today), [state.settings, today])
  const thisWeek = currentSprintWeek(state.settings.sprintStartDate, today)
  const [weekNumber, setWeekNumber] = useState(thisWeek)
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)

  // What the markdown WOULD be right now, used only to detect staleness.
  const live = useMemo(
    () => generateCheckin(state, weekNumber, today),
    [state, weekNumber, today],
  )
  const stale = output !== '' && output !== live

  const generate = () => {
    setOutput(live)
    setCopied(false)
  }

  const copy = async () => {
    const text = output || live
    if (!output) setOutput(text)
    setCopied(await copyToClipboard(text))
  }

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(t)
  }, [copied])

  const review = state.reviews[String(weekNumber)] || {}
  const notesMissing = !review.worked?.trim() && !review.blocked?.trim() && !review.change?.trim()

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-center gap-2 p-2.5">
        <Select
          value={weekNumber}
          onChange={(e) => {
            setWeekNumber(Number(e.target.value))
            setOutput('')
          }}
          aria-label="Week to report on"
          style={{ width: 'auto' }}
        >
          {weeks.map((w) => (
            <option key={w.week} value={w.week}>
              Week {w.week} · {w.label}
              {w.week === thisWeek ? ' (current)' : ''}
            </option>
          ))}
        </Select>

        <Button variant="primary" onClick={generate}>
          Generate check-in
        </Button>
        <Button onClick={copy} disabled={!output && !live}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? 'Copied' : 'Copy to clipboard'}
        </Button>

        {stale && (
          <Badge tone="warn">
            Data changed since generating — regenerate
          </Badge>
        )}
        <span className="ml-auto text-xs text-ink-3">
          {output ? `${output.split('\n').length} lines` : 'Nothing generated yet'}
        </span>
      </div>

      {notesMissing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
          <span className="text-ink-2">
            No reflection notes for week {weekNumber} yet — the Notes section will show dashes.
          </span>
          <Button size="sm" onClick={() => onNavigate('review')}>
            Write them in Weekly Review
          </Button>
        </div>
      )}

      {output ? (
        <>
          {/* The generated markdown, monospaced and selectable. Read-only: edit
              the underlying data (or the notes) rather than the output. */}
          <Card title="Markdown" bodyClass="p-0" action={<CopyInline onCopy={copy} copied={copied} />}>
            <pre className="overflow-x-auto px-3 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap sm:px-4">
              {output}
            </pre>
          </Card>

          <Card title="Preview">
            <MarkdownPreview source={output} />
          </Card>
        </>
      ) : (
        <Card bodyClass="p-0">
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-ink-2">
              Generate the week {weekNumber} check-in to see it here.
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-ink-3">
              It pulls activity vs target, pipeline movement, milestones, your reflection notes and
              the automated flags — everything the coaching conversation needs, in one paste.
            </p>
            <div className="mt-4 flex justify-center">
              <Button variant="primary" onClick={generate}>
                Generate check-in
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function CopyInline({ onCopy, copied }) {
  return (
    <Button size="sm" onClick={onCopy}>
      <Icon name={copied ? 'check' : 'copy'} />
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

/**
 * Minimal markdown renderer — just enough for the check-in's own subset
 * (h2/h3, tables, bullet lists, **bold**). Rendering it here avoids pulling in
 * a markdown dependency for one screen, and there is no untrusted input: the
 * source is always our own generator's output.
 */
function MarkdownPreview({ source }) {
  const blocks = useMemo(() => parseBlocks(source), [source])
  return (
    <div className="space-y-3 text-sm">
      {blocks.map((block, i) => {
        if (block.type === 'h2')
          return (
            <h2 key={i} className="text-base font-semibold">
              {inline(block.text)}
            </h2>
          )
        if (block.type === 'h3')
          return (
            <h3 key={i} className="eyebrow border-b border-line pb-1">
              {block.text}
            </h3>
          )
        if (block.type === 'p')
          return (
            <p key={i} className="text-ink-2">
              {inline(block.text)}
            </p>
          )
        if (block.type === 'ul')
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5 text-ink-2 marker:text-ink-3">
              {block.items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </ul>
          )
        if (block.type === 'table')
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left">
                    {block.head.map((cell, j) => (
                      <th key={j} className={`px-2 py-1.5 font-medium ${j > 1 ? 'text-right' : ''}`}>
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {block.rows.map((row, j) => (
                    <tr key={j}>
                      {row.map((cell, k) => (
                        <td key={k} className={`px-2 py-1.5 ${k > 1 ? 'tabular text-right' : ''}`}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        return null
      })}
    </div>
  )
}

/** Split the markdown into typed blocks. Only the constructs we emit. */
function parseBlocks(source) {
  const lines = source.split('\n')
  const blocks = []
  let i = 0
  const splitRow = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.replace(/\\\|/g, '|').trim())

  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') {
      i++
    } else if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4) })
      i++
    } else if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3) })
      i++
    } else if (line.startsWith('|')) {
      const head = splitRow(lines[i])
      i += 2 // header + separator
      const rows = []
      while (i < lines.length && lines[i].startsWith('|')) rows.push(splitRow(lines[i++]))
      blocks.push({ type: 'table', head, rows })
    } else if (line.startsWith('- ')) {
      const items = []
      while (i < lines.length && lines[i].startsWith('- ')) items.push(lines[i++].slice(2))
      blocks.push({ type: 'ul', items })
    } else {
      blocks.push({ type: 'p', text: line })
      i++
    }
  }
  return blocks
}

/** Render **bold** spans; everything else is literal text. */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-semibold text-ink">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  )
}
