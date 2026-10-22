import { useEffect } from 'react'
import { nextFreePosition } from './model/automaton'
import { useStudioStore } from './store/useStudioStore'

/** Elements where a key press means typing, or where Space already means "activate". */
const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"]'
const ACTIVATABLE = 'button, a[href], summary, [role="tab"], [role="menuitem"]'

/**
 * Handle one key press. Returns true if it was a shortcut (and was consumed).
 * Exported separately from the hook so it can be tested without rendering the app.
 */
export function handleShortcut(e: KeyboardEvent): boolean {
  const st = useStudioStore.getState()
  const target = e.target instanceof Element ? e.target : null
  const key = e.key.toLowerCase()
  const mod = e.ctrlKey || e.metaKey

  // Dialogs own the keyboard while open (they handle Escape and Tab themselves).
  if (st.prompt || st.projects.open || st.helpOpen) return false

  // Ctrl+S always means "save the project", never the browser's save-page dialog.
  if (mod && key === 's') {
    e.preventDefault()
    void st.saveProject()
    return true
  }

  // Everything else is left alone while typing, so a text field keeps its own undo and keys.
  if (target?.closest(TEXT_FIELD)) return false

  if (mod && key === 'z') {
    e.preventDefault()
    if (e.shiftKey) st.redo()
    else st.undo()
    return true
  }
  if (mod && key === 'y') {
    e.preventDefault()
    st.redo()
    return true
  }
  if (mod || e.altKey) return false

  if (e.key === '?') {
    e.preventDefault()
    st.setHelpOpen(true)
    return true
  }

  const editing = !(
    (st.sideTab === 'steps' && st.records[st.activeTabId]) ||
    (st.sideTab === 'compare' && st.compare.sideBySide)
  )
  if (key === 's' && editing) {
    e.preventDefault()
    st.addStateAt(nextFreePosition(st.doc))
    return true
  }

  if (e.key === ' ' && !target?.closest(ACTIVATABLE)) {
    if (st.sideTab === 'simulate' && st.sim.trace) {
      st.gotoStep(st.sim.step + 1)
    } else if (st.sideTab === 'steps' && st.records[st.activeTabId]) {
      st.gotoPlayerStep(st.player.index + 1)
    } else if (st.sideTab === 'compare' && st.compare.sideBySide) {
      st.gotoCompareStep(st.compare.step + 1)
    } else return false
    e.preventDefault() // otherwise Space scrolls the page
    return true
  }

  if (e.key === 'Escape' && st.selection) {
    st.select(null)
    return true
  }
  return false
}

export function useShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])
}
