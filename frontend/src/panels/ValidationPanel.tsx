import type { Issue } from '../api/types'
import { Spinner } from '../components/Spinner'
import { useStudioStore } from '../store/useStudioStore'

export function ValidationPanel() {
  const issues = useStudioStore((s) => s.issues)
  const error = useStudioStore((s) => s.validationError)
  const flagged = useStudioStore((s) => s.flagged)
  const doc = useStudioStore((s) => s.doc)
  const { flag, addTrapState } = useStudioStore.getState()

  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-amber-700 dark:text-amber-400">
        Validation is unavailable: {error}
      </p>
    )
  }
  if (!issues) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-slate-600 dark:text-slate-400">
        <Spinner /> Checking…
      </p>
    )
  }

  const errors = issues.filter((i) => i.severity === 'error').length
  const warnings = issues.length - errors
  const isFlagged = (i: Issue) =>
    flagged.states.length + flagged.transitions.length > 0 &&
    flagged.states.join() === i.stateIds.join() &&
    flagged.transitions.join() === i.transitionIndices.join()
  const canCompleteDfa = doc.kind === 'DFA' && issues.some((i) => i.code === 'INCOMPLETE_DFA')

  return (
    <div className="p-4">
      <p
        role="status"
        className={`mb-3 rounded-md px-3 py-2 text-sm font-medium ${
          errors
            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
            : warnings
              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
        }`}
      >
        {issues.length === 0
          ? 'Valid — no issues found.'
          : `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`}
      </p>

      <ul className="space-y-2">
        {issues.map((i, n) => (
          <li key={`${i.code}-${n}`}>
            <button
              type="button"
              aria-pressed={isFlagged(i)}
              onClick={() =>
                flag(
                  isFlagged(i)
                    ? { states: [], transitions: [] }
                    : { states: i.stateIds, transitions: i.transitionIndices },
                )
              }
              className={`w-full rounded-md border px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                isFlagged(i) ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <span
                className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${
                  i.severity === 'error' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950'
                }`}
              >
                {i.severity}
              </span>
              {i.message}
              {(i.stateIds.length > 0 || i.transitionIndices.length > 0) && (
                <span className="mt-1 block text-xs text-slate-600 dark:text-slate-400">
                  Click to highlight on the canvas
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {canCompleteDfa && (
        <button type="button" className="btn mt-4" onClick={addTrapState}>
          Add trap state to complete this DFA
        </button>
      )}
    </div>
  )
}
