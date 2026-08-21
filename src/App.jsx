/**
 * App.jsx — shell: header, tab navigation, and the active screen.
 * The current tab lives in the URL hash so a refresh (or the phone's back
 * button) keeps your place, and you can bookmark straight to a screen.
 */

import { useEffect, useState } from 'react'
import { useStore } from './data/storeContext.js'
import { currentSprintWeek, sprintWeekRange, todayISO } from './lib/dates.js'
import Dashboard from './screens/Dashboard.jsx'
import DailyLog from './screens/DailyLog.jsx'
import Pipeline from './screens/Pipeline.jsx'
import WeeklyReview from './screens/WeeklyReview.jsx'
import CheckIn from './screens/CheckIn.jsx'
import Settings from './screens/Settings.jsx'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', Screen: Dashboard },
  { id: 'log', label: 'Daily Log', short: 'Log', Screen: DailyLog },
  { id: 'pipeline', label: 'Pipeline', short: 'Pipeline', Screen: Pipeline },
  { id: 'review', label: 'Weekly Review', short: 'Review', Screen: WeeklyReview },
  { id: 'checkin', label: 'Check-in', short: 'Check-in', Screen: CheckIn },
  { id: 'settings', label: 'Settings', short: 'Settings', Screen: Settings },
]

const tabFromHash = () => {
  const id = window.location.hash.replace('#', '')
  return TABS.some((t) => t.id === id) ? id : TABS[0].id
}

export default function App() {
  const { state, saveError } = useStore()
  const [tab, setTab] = useState(tabFromHash)

  // Keep the hash and the state in sync in both directions.
  useEffect(() => {
    const onHashChange = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Changing the hash fires `hashchange`, which sets the tab — but that event
  // is async, so set it here too and keep the click feeling instant.
  const go = (id) => {
    window.history.replaceState(null, '', `#${id}`)
    setTab(id)
  }

  const today = todayISO()
  const weekNumber = currentSprintWeek(state.settings.sprintStartDate, today)
  const week = sprintWeekRange(weekNumber, state.settings.sprintStartDate)
  const { Screen } = TABS.find((t) => t.id === tab) || TABS[0]

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        {/* Two rows on phones so the tab strip gets the full width; one row from
            `sm` up, where everything fits alongside the title. */}
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-5">
          <div className="flex items-baseline gap-2">
            <h1 className="text-sm font-semibold tracking-tight">Cadence Tracker</h1>
            <span className="truncate text-xs text-ink-3">
              Week {weekNumber} of {state.settings.sprintWeeks}
              <span className="hidden sm:inline"> · {week.label}</span>
            </span>
          </div>
          <nav className="-mx-3 flex gap-0.5 overflow-x-auto px-3 sm:mx-0 sm:px-0" aria-label="Screens">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => go(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap sm:px-2.5 sm:text-sm ${
                  tab === t.id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-canvas hover:text-ink'
                }`}
              >
                <span className="hidden sm:inline">{t.label}</span>
                <span className="sm:hidden">{t.short}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      {saveError && (
        <div className="border-b border-bad/25 bg-bad-bg px-3 py-1.5 text-center text-xs text-bad">
          Changes are not being saved — browser storage is full or unavailable. Export your data
          from Settings before closing this tab.
        </div>
      )}

      <main className="mx-auto max-w-6xl px-3 py-3 pb-16 sm:px-5 sm:py-5">
        <Screen today={today} onNavigate={go} />
      </main>
    </div>
  )
}
