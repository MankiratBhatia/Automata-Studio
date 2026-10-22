import { useEffect, useMemo } from 'react'
import { validateAutomaton } from '../api/client'
import { saveWorkspace } from './persistence'
import { selectWorkspace, useStudioStore } from './useStudioStore'

const VALIDATE_DEBOUNCE_MS = 300
const SAVE_DEBOUNCE_MS = 400

/** Re-validate (debounced) whenever something that affects validity changes. Not on drags. */
export function useAutoValidate(): void {
  const doc = useStudioStore((s) => s.doc)
  const key = useMemo(
    () =>
      JSON.stringify([
        doc.kind,
        doc.alphabet,
        doc.states.map((s) => s.id),
        doc.start,
        doc.accepting,
        doc.transitions,
      ]),
    [doc],
  )

  useEffect(() => {
    let stale = false
    const t = setTimeout(async () => {
      const current = useStudioStore.getState().doc
      try {
        const res = await validateAutomaton(current)
        if (!stale) useStudioStore.getState().setIssues(res.issues)
      } catch (e) {
        if (!stale) {
          useStudioStore
            .getState()
            .setIssues(null, e instanceof Error ? e.message : 'Unknown error')
        }
      }
    }, VALIDATE_DEBOUNCE_MS)
    return () => {
      stale = true
      clearTimeout(t)
    }
  }, [key])
}

/** Save every tab to localStorage shortly after any change, including moves. */
export function useAutosave(): void {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = useStudioStore.subscribe((state, prev) => {
      if (
        state.doc === prev.doc &&
        state.tabs === prev.tabs &&
        state.activeTabId === prev.activeTabId
      ) {
        return
      }
      clearTimeout(timer)
      timer = setTimeout(
        () => saveWorkspace(selectWorkspace(useStudioStore.getState())),
        SAVE_DEBOUNCE_MS,
      )
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])
}
