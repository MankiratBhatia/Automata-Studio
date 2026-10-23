import { useStudioStore } from '../store/useStudioStore'
import { InputTape } from '../components/InputTape'
import { Spinner } from '../components/Spinner'
import { Playback } from './Playback'
import { useAutoAdvance } from './useAutoAdvance'

export function SimulationPanel() {
  return (
    <div className="space-y-6 p-4">
      <SingleRun />
      <BatchRun />
    </div>
  )
}

function SingleRun() {
  const sim = useStudioStore((s) => s.sim)
  const { setSimInput, runSimulation, gotoStep, setPlaying } = useStudioStore.getState()
  const { trace, step, playing } = sim
  const last = trace ? trace.steps.length - 1 : 0

  // Auto-advance while playing. gotoStep pauses automatically at the final step.
  useAutoAdvance(playing, () => {
    const st = useStudioStore.getState()
    st.gotoStep(st.sim.step + 1)
  })

  const current = trace?.steps[step]
  const atEnd = !!trace && step === last

  return (
    <section aria-label="Simulate one string">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        Simulate
      </h3>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void runSimulation()
        }}
      >
        <input
          aria-label="Input string"
          value={sim.input}
          onChange={(e) => setSimInput(e.target.value)}
          placeholder="Input string (empty = ε)"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-transparent px-2 py-1 font-mono dark:border-slate-600"
        />
        <button type="submit" className="btn btn-primary" disabled={sim.running}>
          {sim.running ? (
            <span className="inline-flex items-center gap-1.5">
              <Spinner /> Running…
            </span>
          ) : (
            'Run'
          )}
        </button>
      </form>

      {sim.error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {sim.error}
        </p>
      )}

      {trace && current && (
        <div className="mt-4 space-y-3">
          <InputTape
            input={sim.input}
            position={current.position}
            failed={current.states.length === 0 && trace.stuck && atEnd}
          />

          <Playback
            step={step}
            last={last}
            playing={playing}
            onGoto={gotoStep}
            onPlay={setPlaying}
          />

          <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Step {step} of {last}
            </p>
            <p className="font-medium">{current.title}</p>
            <p className="font-mono text-xs">{current.detail}</p>
          </div>

          {atEnd && (
            <p
              role="status"
              data-testid="verdict"
              className={`rounded-md px-3 py-2 text-center text-sm font-bold ${
                trace.accepted ? 'bg-emerald-700 text-white' : 'bg-red-600 text-white'
              }`}
            >
              {trace.accepted ? 'Accepted' : trace.stuck ? 'Rejected (no transition)' : 'Rejected'}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function BatchRun() {
  const batch = useStudioStore((s) => s.batch)
  const { setBatchText, runBatch } = useStudioStore.getState()
  return (
    <section aria-label="Batch test">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
        Batch test
      </h3>
      <textarea
        aria-label="Batch inputs, one per line"
        value={batch.text}
        onChange={(e) => setBatchText(e.target.value)}
        rows={4}
        placeholder={'One string per line\n(a blank line is ε)'}
        spellCheck={false}
        className="w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 font-mono text-sm dark:border-slate-600"
      />
      <button
        type="button"
        className="btn mt-2"
        onClick={() => void runBatch()}
        disabled={batch.running}
      >
        {batch.running ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner /> Running…
          </span>
        ) : (
          'Run all'
        )}
      </button>
      {batch.error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {batch.error}
        </p>
      )}
      {batch.results && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-600 dark:text-slate-400">
              <th className="py-1 font-medium">Input</th>
              <th className="py-1 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {batch.results.map((r, i) => (
              <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                <td className="py-1 font-mono">
                  {r.input === '' ? (
                    <em className="text-slate-600 dark:text-slate-400">ε</em>
                  ) : (
                    r.input
                  )}
                </td>
                <td className="py-1" title={r.error ?? undefined}>
                  {r.error !== null ? (
                    <span className="text-amber-700 dark:text-amber-400">Error: {r.error}</span>
                  ) : r.accepted ? (
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      ✓ Accepted
                    </span>
                  ) : (
                    <span className="font-semibold text-red-700 dark:text-red-400">✗ Rejected</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
