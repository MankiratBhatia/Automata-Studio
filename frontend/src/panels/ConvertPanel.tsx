import { useState } from 'react'
import { Spinner } from '../components/Spinner'
import { subsetKey } from '../model/labels'
import { useStudioStore } from '../store/useStudioStore'

const HEADING =
  'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400'

export function ConvertPanel() {
  return (
    <div className="space-y-6 p-4">
      <RegexSection />
      <ConvertSection />
      <Result />
      <StateKey />
    </div>
  )
}

function RegexSection() {
  const [pattern, setPattern] = useState('')
  const running = useStudioStore((s) => s.convert.running)
  const error = useStudioStore((s) => s.convert.regexError)
  const { buildFromRegex, runPipeline } = useStudioStore.getState()

  return (
    <section aria-label="Regular expression">
      <h3 className={HEADING}>Regex → automaton</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void buildFromRegex(pattern)
        }}
      >
        <input
          aria-label="Regular expression"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="(a|b)*abb"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={error !== null}
          className="w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 font-mono dark:border-slate-600"
        />
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          <code>|</code> union · <code>*</code> <code>+</code> <code>?</code> repeat ·{' '}
          <code>( )</code> group · <code>ε</code> empty string · <code>∅</code> empty set ·{' '}
          <code>\</code> escapes
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={running}>
            Build ε-NFA
          </button>
          <button
            type="button"
            className="btn"
            disabled={running}
            title="Builds the ε-NFA, the DFA and the minimal DFA, each in its own tab"
            onClick={() => void runPipeline(pattern)}
          >
            Run full pipeline
          </button>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <p>{error.message}</p>
          {error.position !== null && (
            // A caret under the offending character, in a monospace block so it lines up.
            <pre aria-hidden className="mt-2 overflow-x-auto font-mono text-xs leading-tight">
              {error.pattern}
              {'\n'}
              {' '.repeat(Math.min(error.position, error.pattern.length))}^
            </pre>
          )}
        </div>
      )}
    </section>
  )
}

function ConvertSection() {
  const doc = useStudioStore((s) => s.doc)
  const running = useStudioStore((s) => s.convert.running)
  const error = useStudioStore((s) => s.convert.error)
  const { runConversion } = useStudioStore.getState()
  const kindName = { DFA: 'DFA', NFA: 'NFA', ENFA: 'ε-NFA' }[doc.kind]
  const empty = doc.states.length === 0

  const actions = [
    {
      op: 'remove-epsilon' as const,
      label: 'Remove ε-transitions',
      help: 'ε-NFA → NFA',
      disabled: doc.kind !== 'ENFA' && 'Only an ε-NFA has ε-transitions to remove.',
    },
    {
      op: 'nfa-to-dfa' as const,
      label: 'Convert to DFA',
      help: 'Subset construction',
      disabled: doc.kind === 'DFA' && 'This is already a DFA.',
    },
    {
      op: 'minimize' as const,
      label: 'Minimise DFA',
      help: 'Merge equivalent states',
      disabled: doc.kind !== 'DFA' && 'Minimisation needs a DFA. Convert to a DFA first.',
    },
  ]

  return (
    <section aria-label="Convert the current automaton">
      <h3 className={HEADING}>Convert this automaton</h3>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        {empty
          ? 'Draw or load an automaton first.'
          : `“${doc.name.trim() || 'Untitled'}” is a ${kindName}. Results open in a new tab.`}
      </p>
      <ul className="space-y-2">
        {actions.map((a) => {
          const reason = empty ? 'Draw or load an automaton first.' : a.disabled
          return (
            <li key={a.op} className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-600 dark:text-slate-400">{a.help}</span>
              <button
                type="button"
                className="btn"
                disabled={running || !!reason}
                title={reason || undefined}
                onClick={() => void runConversion(a.op)}
              >
                {a.label}
              </button>
            </li>
          )
        })}
      </ul>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </p>
      )}
    </section>
  )
}

function Result() {
  const note = useStudioStore((s) => s.convert.note)
  const running = useStudioStore((s) => s.convert.running)
  if (running) {
    return (
      <p
        role="status"
        className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
      >
        <Spinner /> Working…
      </p>
    )
  }
  if (!note) return null
  return (
    <p
      role="status"
      data-testid="convert-note"
      className="rounded-md bg-emerald-100 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
    >
      {note}
    </p>
  )
}

/** Which NFA states each letter of a subset-construction DFA stands for. */
function StateKey() {
  const doc = useStudioStore((s) => s.doc)
  const rows = subsetKey(doc)
  if (rows.length === 0) return null
  return (
    <section aria-label="State key">
      <h3 className={HEADING}>State key</h3>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-200 dark:border-slate-700">
              <th scope="row" className="w-10 py-1 text-left font-mono font-semibold">
                {r.label}
              </th>
              <td className="py-1 font-mono text-xs">{'{' + r.members.join(', ') + '}'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        Each DFA state is the set of NFA states the automaton could be in. ∅ is the trap state.
      </p>
    </section>
  )
}
