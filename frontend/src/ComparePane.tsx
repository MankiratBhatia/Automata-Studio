import { ReadOnlyCanvas } from './canvas/ReadOnlyCanvas'
import type { Automaton } from './model/automaton'
import { showWord } from './model/labels'
import { Playback } from './panels/Playback'
import { useAutoAdvance } from './panels/useAutoAdvance'
import { useStudioStore, type TraceSide } from './store/useStudioStore'

/**
 * The counterexample run on both automata at once, one step at a time. Stacked on normal
 * screens (automata are wide, so each gets the full width), side by side on very wide ones.
 */
export function ComparePane() {
  const compare = useStudioStore((s) => s.compare)
  const { gotoCompareStep, setComparePlaying, closeSideBySide } = useStudioStore.getState()

  useAutoAdvance(compare.playing, () => {
    const st = useStudioStore.getState()
    st.gotoCompareStep(st.compare.step + 1)
  })

  const { checked, traces, result } = compare
  if (!checked || !traces || !result || result.counterexample == null) return null

  const len = (t: TraceSide) => ('trace' in t ? t.trace.steps.length : 1)
  const last = Math.max(len(traces.a), len(traces.b)) - 1
  const word = result.counterexample

  return (
    <div className="flex h-full flex-col" data-testid="compare-pane">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <p className="text-sm">
          Counterexample: <span className="font-mono font-semibold">{showWord(word)}</span>
        </p>
        <div className="w-64">
          <Playback
            step={compare.step}
            last={last}
            playing={compare.playing}
            onGoto={gotoCompareStep}
            onPlay={setComparePlaying}
          />
        </div>
        <button type="button" className="btn ml-auto" onClick={closeSideBySide}>
          Back to editing
        </button>
      </div>
      <div className="grid min-h-0 flex-1 grid-rows-2 divide-y divide-slate-200 2xl:grid-cols-2 2xl:grid-rows-1 2xl:divide-x 2xl:divide-y-0 dark:divide-slate-700">
        <Side id="a" title="A" doc={checked.a} side={traces.a} step={compare.step} />
        <Side id="b" title="B" doc={checked.b} side={traces.b} step={compare.step} />
      </div>
    </div>
  )
}

function Side({
  id,
  title,
  doc,
  side,
  step,
}: {
  id: 'a' | 'b'
  title: string
  doc: Automaton
  side: TraceSide
  step: number
}) {
  const trace = 'trace' in side ? side.trace : null
  const last = trace ? trace.steps.length - 1 : 0
  const current = trace?.steps[Math.min(step, last)]
  const done = !trace || step >= last
  const view = {
    activeStates: new Set(current?.states ?? []),
    activeTransitions: new Set(current?.transitions ?? []),
  }
  return (
    <div className="flex min-h-0 flex-col" data-testid={`side-${id}`}>
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
        <span className="min-w-0 truncate font-medium">
          {title}: {doc.name.trim() || 'Untitled'}
        </span>
        {done && (
          <span
            data-testid={`verdict-${id}`}
            className={`rounded px-2 py-0.5 text-xs font-bold text-white ${
              trace?.accepted ? 'bg-emerald-600' : 'bg-red-600'
            }`}
          >
            {trace?.accepted ? 'Accepts' : 'Rejects'}
          </span>
        )}
      </div>
      {'note' in side && <p className="px-3 pb-1 text-xs text-slate-500">{side.note}</p>}
      <div className="min-h-0 flex-1">
        <ReadOnlyCanvas
          key={`${id}-${doc.name}`}
          doc={doc}
          view={view}
          label={`Automaton ${title}`}
        />
      </div>
    </div>
  )
}
