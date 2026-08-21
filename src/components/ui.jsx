/**
 * ui.jsx — small presentational primitives shared across screens.
 * Nothing here knows about the data model; they take props and render.
 */

import { useEffect, useRef, useState } from 'react'

/* -------------------------------------------------------------------------- */
/* layout                                                                     */
/* -------------------------------------------------------------------------- */

export function Card({ title, action, children, className = '', bodyClass = 'p-3 sm:p-4' }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 sm:px-4">
          <h2 className="eyebrow">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

/** Consistent "nothing here yet" block, with an optional call to action. */
export function Empty({ children, action }) {
  return (
    <div className="px-2 py-6 text-center">
      <p className="text-sm text-ink-3">{children}</p>
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* controls                                                                   */
/* -------------------------------------------------------------------------- */

export function Button({ variant = 'default', size, className = '', ...props }) {
  const variants = { default: 'btn-default', primary: 'btn-primary', danger: 'btn-danger' }
  return (
    <button
      type="button"
      className={`btn ${variants[variant] || variants.default} ${size === 'sm' ? 'btn-sm' : ''} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label mb-1">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  )
}

export function Input(props) {
  return <input className="field" {...props} />
}

export function Select({ children, ...props }) {
  return (
    <select className="field appearance-none bg-surface pr-6" {...props}>
      {children}
    </select>
  )
}

export function Textarea({ rows = 3, ...props }) {
  return <textarea rows={rows} className="field resize-y" {...props} />
}

/** Checkbox + label, sized for thumbs on mobile. */
export function Check({ checked, onChange, children, className = '' }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 ${className}`}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]"
      />
      <span className="text-sm">{children}</span>
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* indicators                                                                 */
/* -------------------------------------------------------------------------- */

export function Badge({ tone = 'neutral', children, className = '' }) {
  const tones = {
    neutral: 'border-line bg-canvas text-ink-2',
    ok: 'border-ok/25 bg-ok-bg text-ok',
    warn: 'border-warn/25 bg-warn-bg text-warn',
    bad: 'border-bad/25 bg-bad-bg text-bad',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Horizontal progress bar. `color` is the track colour (any CSS colour), used
 * for the fill so the bar identifies its track without a legend. Over-target
 * bars stay full width and are marked with a tick instead of overflowing.
 */
export function ProgressBar({ value, max, color = '#0b1220', height = 6 }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : value > 0 ? 100 : 0
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-canvas ring-1 ring-line ring-inset"
      style={{ height }}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max || value || 1}
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/**
 * Tiny bar chart for a short numeric series. Bars, not a line, because with six
 * weekly data points bars are easier to read exactly — and the target line
 * gives every bar a reference.
 */
export function BarSparkline({ data, target = 0, color = '#0b1220', height = 56 }) {
  const values = data.map((d) => d.value)
  const peak = Math.max(target, ...values, 1)
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d) => {
        const h = Math.max(d.value > 0 ? 3 : 1, Math.round((d.value / peak) * height))
        const hit = target > 0 && d.value >= target
        return (
          <div key={d.weekNumber} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="tabular text-[10px] leading-none text-ink-2">{d.value}</span>
            <div
              className="w-full rounded-sm"
              style={{ height: h, background: d.value > 0 ? color : 'var(--color-line)', opacity: hit ? 1 : 0.55 }}
              title={`Week ${d.weekNumber}: ${d.value}`}
            />
            <span className="text-[10px] leading-none text-ink-3">W{d.weekNumber}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Small round swatch for a track colour. */
export function Dot({ color, className = '' }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${className}`}
      style={{ background: color }}
      aria-hidden="true"
    />
  )
}

/* -------------------------------------------------------------------------- */
/* modal + confirm                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Lightweight dialog. Uses <dialog> semantics manually rather than the native
 * element so it renders identically on older iOS Safari.
 */
export function Modal({ open, title, onClose, children, footer, wide = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    // Focus the panel so Escape works and screen readers announce the dialog.
    ref.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-xl border border-line bg-surface shadow-xl outline-none sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-md'}`}
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-ink-3 hover:bg-canvas hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="px-4 py-3">{children}</div>
        {footer && (
          <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface px-4 py-2.5">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/**
 * Two-step destructive action. First click arms it, second confirms; it
 * disarms itself after a few seconds or on blur. Avoids window.confirm (which
 * blocks) and avoids a modal for every little delete.
 */
export function ConfirmButton({ onConfirm, children = 'Delete', confirmLabel = 'Sure?', ...props }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <Button
      variant="danger"
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (armed) {
          setArmed(false)
          onConfirm()
        } else {
          setArmed(true)
        }
      }}
      {...props}
    >
      {armed ? confirmLabel : children}
    </Button>
  )
}

/* -------------------------------------------------------------------------- */
/* icons — inline so there is no icon-font or SVG-sprite dependency           */
/* -------------------------------------------------------------------------- */

const iconPaths = {
  plus: 'M8 3.5v9M3.5 8h9',
  minus: 'M3.5 8h9',
  chevronUp: 'M4 10l4-4 4 4',
  chevronDown: 'M4 6l4 4 4-4',
  check: 'M3.5 8.5l3 3 6-6.5',
  copy: 'M5.5 5.5V3.2c0-.4.3-.7.7-.7h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7h-2.3M3.2 5.5h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7H3.2a.7.7 0 01-.7-.7V6.2c0-.4.3-.7.7-.7z',
  pencil: 'M11.2 2.8l2 2L6 12H4v-2l7.2-7.2z',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.2c0 .4.4.8.8.8h4.2c.4 0 .8-.4.8-.8l.6-8.2',
  download: 'M8 2.5v8M4.5 7.5L8 11l3.5-3.5M3 13h10',
  upload: 'M8 11.5v-8M4.5 6.5L8 3l3.5 3.5M3 13h10',
  warning: 'M8 2.8L14 13H2L8 2.8zM8 6.5v3.2M8 11.4v.1',
  flame: 'M8 2.5s3.2 2.6 3.2 5.6A3.2 3.2 0 018 11.3 3.2 3.2 0 014.8 8.1c0-1.2.6-2.2.6-2.2s.4 1 1.2 1.2c0-1.9 1.4-3.4 1.4-4.6z',
}

export function Icon({ name, size = 14, className = '', fill = false }) {
  const d = iconPaths[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
