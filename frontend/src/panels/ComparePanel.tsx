import { useMemo } from 'react'
import { showWord } from '../model/labels'
import { docOfTab, selectWorkspace, useStudioStore } from '../store/useStudioStore'

const HEADING = 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500'

export function ComparePanel() {
  const storedTabs = useStudioStore((s) => s.tabs)
  const doc = useStudioStore((s) => s.doc)
  const activeId = useStudioStore((s) => s.activeTabId)
  const compare = useStudioStore((s) => s.compare)
  const tabs = useMemo(
    () => selectWorkspace({ tabs: storedTabs, doc, activeTabId: activeId }).tabs,
    [storedTabs, doc, activeId],
  )
  const { setCompareTabs, runEquivalence, openSideBySide } = useStudioStore.getState()

  const name = (id: string) => tabs.find((t) => t.id === id)?.doc.name.trim() || 'Untitled'
  const valid = (id: string | null) => (id && tabs.some((t) => t.id === id) ? id : null)
  const aId = valid(compare.aId) ?? activeId
  const bId = valid(compare.bId) ?? tabs.find((t) => t.id !== aId)?.id ?? null

  // The result describes the automata as they were when checked; any edit since makes it stale.
  const state = useStudioStore.getState()
  const stale =
    compare.checked !== null &&
    (docOfTab(state, aId) !== compare.checked.a ||
      (bId !== null && docOfTab(state, bId) !== compare.checked.b))

  const select = (label: string, value: string | null, onChange: (id: string) => void) => (
    <label className="block text-sm">
      {label}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
      >
        {tabs.map((t) => (
          <option key={t.id} value={t.id}>
            {t.doc.name.trim() || 'Untitled'}
          </option>
        ))}
      </select>
    </label>
  )

  const r = compare.result
  const reason =
    tabs.length < 2
      ? 'Open a second automaton in another tab to compare.'
      : aId === bId
        ? 'Pick two different tabs.'
        : null

  return (
    <div className="space-y-4 p-4">
      <section aria-label="Choose automata">
        <h3 className={HEADING}>Equivalence check</h3>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Do two automata accept exactly the same strings? If not, you get a shortest string that
          tells them apart.
        </p>
        <div className="space-y-3">
          {select('Automaton A', aId, (id) => setCompareTabs(id, bId ?? id))}
          {select('Automaton B', bId, (id) => setCompareTabs(aId, id))}
        </div>
        <button
          type="button"
          className="btn btn-primary mt-3"
          disabled={compare.running || !!reason || bId === null}
          title={reason ?? undefined}
          onClick={() => bId && void runEquivalence(aId, bId)}
        >
          {compare.running ? 'Checking…' : 'Check equivalence'}
        </button>
        {reason && <p className="mt-2 text-xs text-slate-500">{reason}</p>}
      </section>

      {compare.error && (
        <p
          role="alert"
          className="rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {compare.error}
        </p>
      )}

      {r && (
        <section
          data-testid="equivalence-result"
          className={`space-y-2 rounded-md p-3 text-sm ${
            r.equivalent
              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
              : 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100'
          }`}
        >
          {stale && (
            <p className="rounded bg-amber-200 px-2 py-1 text-xs text-amber-950">
              An automaton changed since this check. Run it again.
            </p>
          )}
          {r.equivalent ? (
            <>
              <p className="font-semibold">Equivalent</p>
              <p>
                {name(aId)} and {name(bId ?? aId)} accept exactly the same strings. The search
                covered {r.explored} state pair{r.explored === 1 ? '' : 's'}.
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Not equivalent</p>
              <p>
                Shortest counterexample:{' '}
                <span data-testid="counterexample" className="font-mono font-semibold">
                  {showWord(r.counterexample ?? '')}
                </span>
              </p>
              <p>
                A {r.aAccepts ? 'accepts' : 'rejects'} it; B {r.bAccepts ? 'accepts' : 'rejects'}{' '}
                it.
              </p>
              <button type="button" className="btn" onClick={() => void openSideBySide()}>
                Show both runs
              </button>
            </>
          )}
        </section>
      )}
    </div>
  )
}
