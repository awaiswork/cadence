/**
 * store.jsx — the app's single state container.
 * =============================================================================
 * A `useReducer` over the whole state object from schema.js, wrapped in a
 * context, persisted to localStorage on a short debounce.
 *
 * All state transitions live in reducer.js (pure, testable). This file is only
 * the React plumbing: load on boot, save on change, and a memoised `actions`
 * object so components never construct action objects themselves.
 *
 * Consumers:
 *   const { state, actions } = useStore()
 */

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { reducer } from './reducer.js'
import { StoreContext } from './storeContext.js'
import { loadState, saveState, storageAvailable } from './storage.js'

/** How long to wait after the last change before writing to localStorage. */
const SAVE_DEBOUNCE_MS = 250

/* -------------------------------------------------------------------------- */
/* provider                                                                   */
/* -------------------------------------------------------------------------- */

export function StoreProvider({ children }) {
  // `loadState` runs once, lazily — it seeds when localStorage is empty.
  const [state, dispatch] = useReducer(reducer, null, loadState)
  const [saveError, setSaveError] = useState(false)
  const firstRun = useRef(true)

  // Debounced persistence. Typing in a note fires many actions per second;
  // this collapses them into one write.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      // Persist the seed immediately so a first-run refresh keeps the same ids.
      setSaveError(!saveState(state) && storageAvailable)
      return
    }
    const timer = setTimeout(() => {
      setSaveError(!saveState(state) && storageAvailable)
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [state])

  // Bound action creators. Memoised so context consumers don't re-render on
  // every keystroke just because the function identities changed.
  const actions = useMemo(
    () => ({
      setState: (next) => dispatch({ type: 'SET_STATE', state: next }),
      reset: ({ seed = false } = {}) => dispatch({ type: 'RESET', seed }),

      setSettings: (patch) => dispatch({ type: 'SET_SETTINGS', patch }),

      addTrack: (patch) => dispatch({ type: 'ADD_TRACK', patch }),
      updateTrack: (id, patch) => dispatch({ type: 'UPDATE_TRACK', id, patch }),
      moveTrack: (id, delta) => dispatch({ type: 'MOVE_TRACK', id, delta }),
      deleteTrack: (id) => dispatch({ type: 'DELETE_TRACK', id }),

      addActivity: (patch) => dispatch({ type: 'ADD_ACTIVITY', patch }),
      updateActivity: (id, patch) => dispatch({ type: 'UPDATE_ACTIVITY', id, patch }),
      moveActivity: (id, delta) => dispatch({ type: 'MOVE_ACTIVITY', id, delta }),
      deleteActivity: (id) => dispatch({ type: 'DELETE_ACTIVITY', id }),

      /** Upsert one day's count for one activity. */
      setLog: (activityId, date, count, note) =>
        dispatch({ type: 'SET_LOG', activityId, date, count, note }),
      /** Add `delta` to one day's count, resolved inside the reducer. */
      incrementLog: (activityId, date, delta) =>
        dispatch({ type: 'INCREMENT_LOG', activityId, date, delta }),
      deleteLog: (id) => dispatch({ type: 'DELETE_LOG', id }),

      addPipelineItem: (patch) => dispatch({ type: 'ADD_PIPELINE_ITEM', patch }),
      /** `date` records WHEN a status change happened (defaults to today). */
      updatePipelineItem: (id, patch, date) =>
        dispatch({ type: 'UPDATE_PIPELINE_ITEM', id, patch, date }),
      deletePipelineItem: (id) => dispatch({ type: 'DELETE_PIPELINE_ITEM', id }),

      addMilestone: (patch) => dispatch({ type: 'ADD_MILESTONE', patch }),
      updateMilestone: (id, patch) => dispatch({ type: 'UPDATE_MILESTONE', id, patch }),
      deleteMilestone: (id) => dispatch({ type: 'DELETE_MILESTONE', id }),

      setReview: (weekNumber, patch) => dispatch({ type: 'SET_REVIEW', weekNumber, patch }),
    }),
    [],
  )

  const value = useMemo(() => ({ state, actions, saveError }), [state, actions, saveError])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
