import { useMemo } from 'react'
import { Spinner } from '../components/Spinner'
import { tapeAt, tapeWindow, tmOutcome } from '../model/machineRuns'
import {
  addState,
  addTmTransition,
  removeState,
  removeTransition,
  renameState,
  setAccepting,
  setStart,
  tmDiagram,
  toggleRejecting,
  updateTmTransition,
  type Move,
  type Tm,
} from '../model/machines'
import { Playback } from '../panels/Playback'
import { useAutoAdvance } from '../panels/useAutoAdvance'
import {
  AlphabetField,
  CELL,
  HEADING,
  IssueList,
  SELECT,
  SpeedSelect,
  StatesEditor,
  TextField,
} from './editorParts'
import { MachineDiagram } from './MachineDiagram'
import { MachineShell } from './MachineShell'
import { SPEEDS, useMachineStore } from './useMachineStore'

export function TmApp() {
  const tm = useMachineStore((s) => s.tm)
  const run = useMachineStore((s) => s.tmRun)
  const diagram = useMemo(() => tmDiagram(tm), [tm])
  const steps = run.result?.steps
  const current = steps ? steps[Math.min(run.step, steps.length - 1)] : undefined
  return (
    <MachineShell
      kind="tm"
      diagram={
        <MachineDiagram
          diagram={diagram}
          activeState={current?.state}
          activeTransition={current?.transition}
          label="Turing machine diagram"
        />
      }
      dock={<TapeDock />}
      tabs={[
        { id: 'machine', label: 'Machine', panel: <TmEditor /> },
        { id: 'run', label: 'Run', panel: <TmRunPanel /> },
      ]}
    />
  )
}

// --- editing ------------------------------------------------------------------------------

function TmEditor() {
  const tm = useMachineStore((s) => s.tm)
  const issues = useMachineStore((s) => s.validation.tm)
  const edit = useMachineStore.getState().editTm

  return (
    <div className="space-y-6 p-4">
      <section aria-label="Machine settings">
        <h3 className={HEADING}>Turing machine</h3>
        <div className="space-y-3">
          <TextField
            label="Name"
            value={tm.name}
            onCommit={(name) => edit((t) => ({ ...t, name }))}
          />
          <AlphabetField
            label="Input alphabet"
            value={tm.inputAlphabet}
            onCommit={(inputAlphabet) => edit((t) => ({ ...t, inputAlphabet }))}
            placeholder="0, 1"
          />
          <AlphabetField
            label="Tape alphabet"
            value={tm.tapeAlphabet}
            onCommit={(tapeAlphabet) => edit((t) => ({ ...t, tapeAlphabet }))}
            placeholder="0, 1, _"
          />
          <TextField
            label="Blank symbol"
            value={tm.blank}
            onCommit={(blank) => edit((t) => ({ ...t, blank: [...blank][0] ?? t.blank }))}
            hint="One character, and it must be in the tape alphabet."
            mono
          />
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          The tape is unbounded in both directions. The first input symbol is in cell 0. A move of S
          keeps the head where it is.
        </p>
      </section>

      <StatesEditor
        states={tm.states}
        start={tm.start}
        accepting={tm.accepting}
        rejecting={tm.rejecting}
        onAdd={() => edit(addState)}
        onRename={(id, name) => {
          let error: string | null = null
          edit((t) => {
            const r = renameState(t, id, name)
            if ('error' in r) {
              error = r.error
              return t
            }
            return r.machine
          })
          return error
        }}
        onRemove={(id) => edit((t) => removeState(t, id))}
        onStart={(id) => edit((t) => setStart(t, id))}
        onAccepting={(id) => edit((t) => setAccepting(t, id))}
        onRejecting={(id) => edit((t) => toggleRejecting(t, id))}
      />

      <TransitionTable />

      <section aria-label="Problems">
        <h3 className={HEADING}>Problems</h3>
        <IssueList issues={issues.issues} error={issues.error} />
      </section>
    </div>
  )
}

function TransitionTable() {
  const tm = useMachineStore((s) => s.tm)
  const edit = useMachineStore.getState().editTm
  const states = tm.states.map((s) => s.id)
  const set = (i: number, patch: Partial<Tm['transitions'][number]>) =>
    edit((t) => updateTmTransition(t, i, { ...t.transitions[i], ...patch }))
  const pick = (value: string) => (states.includes(value) ? states : [value, ...states])

  return (
    <section aria-label="Transitions">
      <h3 className={HEADING}>Transitions</h3>
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
        In state <em>from</em>, reading <em>read</em>: write <em>write</em>, move the head, go to{' '}
        <em>to</em>. A machine halts in an accepting or rejecting state, or when no move applies
        (which rejects).
      </p>
      {tm.transitions.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-600 dark:text-slate-400">
              {['From', 'Read', 'Write', 'Move', 'To'].map((h) => (
                <th key={h} scope="col" className="px-0.5 py-1 font-medium">
                  {h}
                </th>
              ))}
              <th scope="col" className="sr-only">
                Delete
              </th>
            </tr>
          </thead>
          <tbody>
            {tm.transitions.map((t, i) => (
              <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-0.5">
                  <select
                    aria-label={`Transition ${i + 1} from`}
                    value={t.from}
                    onChange={(e) => set(i, { from: e.target.value })}
                    className={SELECT}
                  >
                    {pick(t.from).map((s) => (
                      <option key={s} value={s}>
                        {s || '—'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-0.5">
                  <input
                    aria-label={`Transition ${i + 1} read`}
                    value={t.read}
                    maxLength={1}
                    onChange={(e) => set(i, { read: e.target.value })}
                    className={`${CELL} w-9 text-center`}
                  />
                </td>
                <td className="p-0.5">
                  <input
                    aria-label={`Transition ${i + 1} write`}
                    value={t.write}
                    maxLength={1}
                    onChange={(e) => set(i, { write: e.target.value })}
                    className={`${CELL} w-9 text-center`}
                  />
                </td>
                <td className="p-0.5">
                  <select
                    aria-label={`Transition ${i + 1} move`}
                    value={t.move}
                    onChange={(e) => set(i, { move: e.target.value as Move })}
                    className={SELECT}
                  >
                    {(['L', 'R', 'S'] as const).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-0.5">
                  <select
                    aria-label={`Transition ${i + 1} to`}
                    value={t.to}
                    onChange={(e) => set(i, { to: e.target.value })}
                    className={SELECT}
                  >
                    {pick(t.to).map((s) => (
                      <option key={s} value={s}>
                        {s || '—'}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-0.5 text-right">
                  <button
                    type="button"
                    aria-label={`Delete transition ${i + 1}`}
                    onClick={() => edit((m) => removeTransition(m, i))}
                    className="rounded px-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        className="btn mt-2"
        disabled={tm.states.length === 0}
        title={tm.states.length === 0 ? 'Add a state first' : undefined}
        onClick={() => edit(addTmTransition)}
      >
        Add transition
      </button>
    </section>
  )
}

// --- running ------------------------------------------------------------------------------

const BADGE = {
  accepted: 'bg-emerald-700 text-white',
  rejected: 'bg-red-600 text-white',
  limit: 'bg-amber-400 text-amber-950',
} as const
const WORD = { accepted: 'Accepted', rejected: 'Rejected', limit: 'Step limit' } as const

function TmRunPanel() {
  const tm = useMachineStore((s) => s.tm)
  const run = useMachineStore((s) => s.tmRun)
  const { setInput, run: start, gotoStep, setPlaying } = useMachineStore.getState()
  const result = run.result
  const last = Math.max(0, (result?.steps.length ?? 1) - 1)
  const ms = SPEEDS.find((s) => s.id === run.speed)?.ms ?? 300

  useAutoAdvance(
    run.playing,
    () => {
      const st = useMachineStore.getState()
      st.gotoStep('tm', st.tmRun.step + 1)
    },
    ms,
  )
  const step = result?.steps[Math.min(run.step, last)]

  return (
    <div className="space-y-4 p-4">
      <section aria-label="Run the Turing machine">
        <h3 className={HEADING}>Run</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void start('tm')
          }}
        >
          <input
            aria-label="Input string"
            value={run.input}
            onChange={(e) => setInput('tm', e.target.value)}
            placeholder="Input string (empty = blank tape)"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-transparent px-2 py-1 font-mono dark:border-slate-600"
          />
          <button type="submit" className="btn btn-primary" disabled={run.running}>
            {run.running ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner /> Running…
              </span>
            ) : (
              'Run'
            )}
          </button>
        </form>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Symbols from the input alphabet
          {tm.inputAlphabet.length ? ` (${tm.inputAlphabet.join(', ')})` : ''}. The machine stops
          after at most 10,000 steps.
        </p>
      </section>

      {run.error && (
        <p
          role="alert"
          className="rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {run.error}
        </p>
      )}

      {result && step && (
        <>
          <section aria-label="Result" className="space-y-2">
            <p
              role="status"
              data-testid="verdict"
              className={`rounded-md px-3 py-2 text-center text-sm font-bold ${BADGE[result.status]}`}
            >
              {WORD[result.status]}
            </p>
            <p className="text-sm">{tmOutcome(result.status, result.reason)}</p>
            <p className="text-sm">
              Tape when it stopped:{' '}
              <code
                data-testid="output"
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800"
              >
                {result.output === '' ? '(blank)' : result.output}
              </code>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {last} step{last === 1 ? '' : 's'} taken.
            </p>
          </section>

          <section aria-label="Replay" className="space-y-3">
            <Playback
              step={run.step}
              last={last}
              playing={run.playing}
              onGoto={(n) => gotoStep('tm', n)}
              onPlay={(p) => setPlaying('tm', p)}
            />
            <SpeedSelect kind="tm" />
            <div
              data-testid="step-card"
              className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"
            >
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Step {run.step} of {last} · state{' '}
                <strong className="font-mono">{step.state}</strong> · head at cell {step.head}
              </p>
              <p className="font-mono text-xs">{step.note}</p>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              The tape is shown under the diagram.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

/** The tape, a window of cells around the head, shown under the diagram while a run is replayed. */
function TapeDock() {
  const tm = useMachineStore((s) => s.tm)
  const run = useMachineStore((s) => s.tmRun)
  const result = run.result
  const steps = result?.steps
  const step = steps ? steps[Math.min(run.step, steps.length - 1)] : undefined
  const cells = useMemo(() => {
    if (!steps || !step) return null
    return tapeWindow(tapeAt(run.input, tm.blank, steps, step.index), step.head, tm.blank, 21)
  }, [steps, step, run.input, tm.blank])

  if (!cells || !step) {
    return (
      <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
        Run the machine to see its tape here.
      </p>
    )
  }
  return (
    <figure
      aria-label="Tape"
      data-testid="tape"
      className="border-t border-slate-200 px-4 pb-3 pt-2 dark:border-slate-700"
    >
      <figcaption className="mb-1 text-xs text-slate-600 dark:text-slate-400">
        Tape · state <strong className="font-mono">{step.state}</strong> · cell {step.head}
      </figcaption>
      <div className="overflow-x-auto">
        <ol
          className="flex w-max gap-0.5"
          aria-label={`Tape cells around the head, head at cell ${step.head}`}
        >
          {cells.map((c) => (
            <li key={c.index} className="flex w-7 flex-col items-center">
              <span
                aria-hidden
                className={`h-3 text-[10px] leading-3 ${c.isHead ? 'text-blue-700 dark:text-blue-300' : 'invisible'}`}
              >
                ▼
              </span>
              <span
                data-head={c.isHead || undefined}
                className={`grid h-8 w-7 place-items-center rounded border font-mono text-sm ${
                  c.isHead
                    ? 'border-blue-600 bg-blue-100 font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                    : c.symbol === tm.blank
                      ? 'border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400'
                      : 'border-slate-400 dark:border-slate-500'
                }`}
              >
                {c.symbol}
                {c.isHead && <span className="sr-only"> (head)</span>}
              </span>
              <span className="text-[10px] text-slate-600 dark:text-slate-400">{c.index}</span>
            </li>
          ))}
        </ol>
      </div>
    </figure>
  )
}
