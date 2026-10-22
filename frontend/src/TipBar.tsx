import { useState } from 'react'
import { useStudioStore } from './store/useStudioStore'

const KEY = 'automata-studio:tip-dismissed'

const wasDismissed = () => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** A one-line reminder of the main gestures, shown until dismissed (and only once there is a drawing). */
export function TipBar() {
  const [dismissed, setDismissed] = useState(wasDismissed)
  const hasStates = useStudioStore((s) => s.doc.states.length > 0)
  if (dismissed || !hasStates) return null
  return (
    <p className="flex items-center gap-3 border-b border-slate-200 bg-blue-50 px-4 py-1.5 text-sm text-blue-900 dark:border-slate-700 dark:bg-blue-950 dark:text-blue-100">
      <span className="flex-1">
        <strong>Tip:</strong> drag from a state’s blue dot to connect states · double-click a label
        to edit it · press{' '}
        <kbd className="rounded border border-blue-300 px-1 font-mono text-xs">?</kbd> for shortcuts
      </span>
      <button
        type="button"
        className="rounded px-2 underline"
        onClick={() => {
          try {
            localStorage.setItem(KEY, '1')
          } catch {
            // Storage blocked: the tip simply returns next visit.
          }
          setDismissed(true)
        }}
      >
        Got it
      </button>
    </p>
  )
}
