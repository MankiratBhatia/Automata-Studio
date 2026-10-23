import { useMemo } from 'react'
import { InputTape } from '../components/InputTape'
import { Spinner } from '../components/Spinner'
import { stackCells, currentOf, pdaOutcome } from '../model/machineRuns'
import {
  addPdaTransition,
  addState,
  fromPdaRow,
  pdaDiagram,
  pdaRow,
  removeState,
  removeTransition,
  renameState,
  setStart,
  toggleAccepting,
  updatePdaTransition,
  type Pda,
  type PdaRow,
} from '../model/machines'
import { Playback } from '../panels/Playback'
import { useAutoAdvance } from '../panels/useAutoAdvance'
import {
  AlphabetField,
  CELL,
  FIELD,
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

export function PdaApp() {
  const pda = useMachineStore((s) => s.pda)
  const run = useMachineStore((s) => s.pdaRun)
  const diagram = useMemo(() => pdaDiagram(pda), [pda])
  const current = run.result ? currentOf(run.result.steps, run.step) : undefined
  return (
    <MachineShell
      kind="pda"
      diagram={
        <MachineDiagram
          diagram={diagram}
          activeState={current?.state}
          activeTransition={current?.transition}
          label="Pushdown automaton diagram"
        />
      }
      tabs={[
        { id: 'machine', label: 'Machine', panel: <PdaEditor /> },
        { id: 'run', label: 'Run', panel: <PdaRunPanel /> },
      ]}
    />
  )
}

// --- editing ------------------------------------------------------------------------------

function PdaEditor() {
  const pda = useMachineStore((s) => s.pda)
  const issues = useMachineStore((s) => s.validation.pda)
  const edit = useMachineStore.getState().editPda

  return (
    <div className="space-y-6 p-4">
      <section aria-label="Machine settings">
        <h3 className={HEADING}>Pushdown automaton</h3>
        <div className="space-y-3">
          <TextField
            label="Name"
            value={pda.name}
            onCommit={(name) => edit((p) => ({ ...p, name }))}
          />
          <AlphabetField
            label="Input alphabet"
            value={pda.inputAlphabet}
            onCommit={(inputAlphabet) => edit((p) => ({ ...p, inputAlphabet }))}
            placeholder="a, b"
          />
          <AlphabetField
            label="Stack alphabet"
            value={pda.stackAlphabet}
            onCommit={(stackAlphabet) => edit((p) => ({ ...p, stackAlphabet }))}
            placeholder="Z, A"
          />
          <label className="block text-sm">
            Initial stack symbol
            <select
              value={pda.startStack}
              onChange={(e) => edit((p) => ({ ...p, startStack: e.target.value }))}
              className={`${FIELD} dark:bg-slate-900`}
            >
              <option value="">(empty stack)</option>
              {pda.stackAlphabet.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Accept by
            <select
              value={pda.acceptBy}
              onChange={(e) => edit((p) => ({ ...p, acceptBy: e.target.value as Pda['acceptBy'] }))}
              className={`${FIELD} dark:bg-slate-900`}
            >
              <option value="finalState">Final state</option>
              <option value="emptyStack">Empty stack</option>
            </select>
            <span className="text-xs text-slate-600 dark:text-slate-400">
              {pda.acceptBy === 'finalState'
                ? 'Accept when the input is used up and the machine is in an accepting state.'
                : 'Accept when the input is used up and the stack is empty. Accepting states are ignored.'}
            </span>
          </label>
        </div>
      </section>

      <StatesEditor
        states={pda.states}
        start={pda.start}
        accepting={pda.accepting}
        onAdd={() => edit(addState)}
        onRename={(id, name) => {
          let error: string | null = null
          edit((p) => {
            const r = renameState(p, id, name)
            if ('error' in r) {
              error = r.error
              return p
            }
            return r.machine
          })
          return error
        }}
        onRemove={(id) => edit((p) => removeState(p, id))}
        onStart={(id) => edit((p) => setStart(p, id))}
        onAccepting={(id) => edit((p) => toggleAccepting(p, id))}
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
  const pda = useMachineStore((s) => s.pda)
  const edit = useMachineStore.getState().editPda
  const states = pda.states.map((s) => s.id)
  const set = (i: number, patch: Partial<PdaRow>) =>
    edit((p) => updatePdaTransition(p, i, fromPdaRow({ ...pdaRow(p.transitions[i]), ...patch })))

  return (
    <section aria-label="Transitions">
      <h3 className={HEADING}>Transitions</h3>
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
        In state <em>from</em>, read <em>read</em> (blank or ε: nothing), pop <em>pop</em> (blank:
        nothing), go to <em>to</em> and push <em>push</em>, written top first.
      </p>
      {pda.transitions.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-600 dark:text-slate-400">
              {['From', 'Read', 'Pop', 'To', 'Push'].map((h) => (
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
            {pda.transitions.map((t, i) => (
              <tr key={i} className="border-t border-slate-200 dark:border-slate-700">
                <td className="p-0.5">
                  <StateSelect
                    label={`Transition ${i + 1} from`}
                    value={t.from}
                    states={states}
                    onChange={(v) => set(i, { from: v })}
                  />
                </td>
                <td className="p-0.5">
                  <input
                    aria-label={`Transition ${i + 1} read`}
                    value={t.input ?? ''}
                    placeholder="ε"
                    maxLength={1}
                    onChange={(e) => set(i, { input: e.target.value })}
                    className={`${CELL} w-9 text-center`}
                  />
                </td>
                <td className="p-0.5">
                  <input
                    aria-label={`Transition ${i + 1} pop`}
                    value={t.pop ?? ''}
                    placeholder="ε"
                    maxLength={1}
                    onChange={(e) => set(i, { pop: e.target.value })}
                    className={`${CELL} w-9 text-center`}
                  />
                </td>
                <td className="p-0.5">
                  <StateSelect
                    label={`Transition ${i + 1} to`}
                    value={t.to}
                    states={states}
                    onChange={(v) => set(i, { to: v })}
                  />
                </td>
                <td className="p-0.5">
                  <input
                    aria-label={`Transition ${i + 1} push`}
                    value={t.push}
                    placeholder="ε"
                    maxLength={20}
                    onChange={(e) => set(i, { push: e.target.value })}
                    className={`${CELL} w-14`}
                  />
                </td>
                <td className="p-0.5 text-right">
                  <button
                    type="button"
                    aria-label={`Delete transition ${i + 1}`}
                    onClick={() => edit((p) => removeTransition(p, i))}
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
        disabled={pda.states.length === 0}
        title={pda.states.length === 0 ? 'Add a state first' : undefined}
        onClick={() => edit(addPdaTransition)}
      >
        Add transition
      </button>
    </section>
  )
}

function StateSelect({
  label,
  value,
  states,
  onChange,
}: {
  label: string
  value: string
  states: string[]
  onChange: (v: string) => void
}) {
  // A move may point at a state that no longer exists; keep it visible so the user can fix it.
  const options = states.includes(value) ? states : [value, ...states]
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT}
    >
      {options.map((s) => (
        <option key={s} value={s}>
          {s || '—'}
        </option>
      ))}
    </select>
  )
}

// --- running ------------------------------------------------------------------------------

const BADGE = {
  accepted: 'bg-emerald-700 text-white',
  rejected: 'bg-red-600 text-white',
  limit: 'bg-amber-400 text-amber-950',
} as const
const WORD = { accepted: 'Accepted', rejected: 'Rejected', limit: 'Undecided' } as const

function PdaRunPanel() {
  const pda = useMachineStore((s) => s.pda)
  const run = useMachineStore((s) => s.pdaRun)
  const { setInput, run: start, gotoStep, setPlaying } = useMachineStore.getState()
  const result = run.result
  const steps = result?.steps ?? []
  const last = Math.max(0, steps.length - 1)
  const step = currentOf(steps, run.step)
  const ms = SPEEDS.find((s) => s.id === run.speed)?.ms ?? 300

  useAutoAdvance(
    run.playing,
    () => {
      const st = useMachineStore.getState()
      st.gotoStep('pda', st.pdaRun.step + 1)
    },
    ms,
  )

  return (
    <div className="space-y-4 p-4">
      <section aria-label="Run the pushdown automaton">
        <h3 className={HEADING}>Run</h3>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void start('pda')
          }}
        >
          <input
            aria-label="Input string"
            value={run.input}
            onChange={(e) => setInput('pda', e.target.value)}
            placeholder="Input string (empty = ε)"
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
          {pda.inputAlphabet.length ? ` (${pda.inputAlphabet.join(', ')})` : ''}.
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
              className={`rounded-md px-3 py-2 text-center text-sm font-bold ${BADGE[result.verdict]}`}
            >
              {WORD[result.verdict]}
            </p>
            <p className="text-sm">{pdaOutcome(result.verdict, result.reason)}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Searched {result.explored} configuration{result.explored === 1 ? '' : 's'}.
              {result.closest &&
                ` Showing the closest attempt: it read ${steps[last].position} of ${run.input.length} symbol${run.input.length === 1 ? '' : 's'}.`}
            </p>
          </section>

          <section aria-label="Replay" className="space-y-3">
            <Playback
              step={run.step}
              last={last}
              playing={run.playing}
              onGoto={(n) => gotoStep('pda', n)}
              onPlay={(p) => setPlaying('pda', p)}
            />
            <SpeedSelect kind="pda" />
            <div
              data-testid="step-card"
              className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"
            >
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Step {run.step} of {last} · state{' '}
                <strong className="font-mono">{step.state}</strong>
              </p>
              <p className="font-mono text-xs">{step.note}</p>
            </div>
            <InputTape input={run.input} position={step.position} failed={false} />
            <StackView stack={step.stack} />
          </section>
        </>
      )}
    </div>
  )
}

/** The stack, top first, as a column of boxes with the top one highlighted. */
export function StackView({ stack }: { stack: string }) {
  const cells = stackCells(stack)
  return (
    <figure aria-label="Stack" data-testid="stack">
      <figcaption className={HEADING}>Stack (top first)</figcaption>
      {cells.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 py-3 text-center text-sm text-slate-600 dark:border-slate-600 dark:text-slate-400">
          empty
        </p>
      ) : (
        <ol
          className="flex w-28 flex-col gap-1"
          aria-label={`Stack, top first: ${cells.join(', ')}`}
        >
          {cells.map((c, i) => (
            <li
              key={i}
              className={`flex h-8 items-center justify-between rounded border px-2 font-mono ${
                i === 0
                  ? 'border-blue-600 bg-blue-100 font-bold text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              <span>{c}</span>
              {i === 0 && <span className="text-[10px] font-normal uppercase">top</span>}
            </li>
          ))}
        </ol>
      )}
    </figure>
  )
}
