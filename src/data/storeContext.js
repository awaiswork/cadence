/**
 * storeContext.js — the context object and its hook.
 * Kept out of store.jsx so that file exports only the <StoreProvider>
 * component, which is what React Fast Refresh needs to reload it cleanly.
 */

import { createContext, useContext } from 'react'

export const StoreContext = createContext(null)

/** `const { state, actions } = useStore()` — the only way screens read state. */
export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>')
  return ctx
}
