import { useState } from 'react'
import { formatSymbol, parseAlphabet, symbolsOfEdge, type Kind } from '../model/automaton'
import { useStudioStore } from '../store/useStudioStore'

const KIND_LABEL: Record<Kind, string> = { DFA: 'DFA', NFA: 'NFA', ENFA: 'ε-NFA' }

export function PropertiesPanel() {
  const selection = useStudioStore((s) => s.selection)
  return (
    <div className="space-y-6 p-4">
      {selection?.kind === 'state' && <StateSection id={selection.id} />}
      {selection?.kind === 'edge' && <EdgeSection from={selection.from} to={selection.to} />}
      {!selection && (
        <p className="text-sm text-slate-500">
          Select a state or transition on the canvas to edit it. Double-click empty space to add a
          state; drag from a state’s dot to connect.
        </p>
      )}
      <AutomatonSection />
    </div>
  )
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h3>
  )
}

function AutomatonSection() {
  const doc = useStudioStore((s) => s.doc)
  const { setName, setKind, setAlphabet } = useStudioStore.getState()
  const alphabetText = doc.alphabet.join(', ')
  // `null` means "not editing": show the real alphabet, so outside changes (new symbols from
  // transitions, loading an example) appear immediately.
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft !== null) {
      const parsed = parseAlphabet(draft)
      if (parsed.join() !== doc.alphabet.join()) setAlphabet(parsed)
    }
    setDraft(null)
  }

  return (
    <section>
      <Heading>Automaton</Heading>
      <div className="space-y-3 text-sm">
        <label className="block">
          Name
          <input
            value={doc.name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600"
          />
        </label>
        <label className="block">
          Type
          <select
            value={doc.kind}
            onChange={(e) => setKind(e.target.value as Kind)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          Alphabet
          <input
            value={draft ?? alphabetText}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder="0, 1"
            className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 font-mono dark:border-slate-600"
          />
          <span className="text-xs text-slate-500">
            Single characters. Applied when you leave the field.
          </span>
        </label>
      </div>
    </section>
  )
}

function StateSection({ id }: { id: string }) {
  const doc = useStudioStore((s) => s.doc)
  const { renameState, toggleAccepting, setStart, deleteState, openPrompt } =
    useStudioStore.getState()
  const state = doc.states.find((s) => s.id === id)
  const [target, setTarget] = useState('')
  if (!state) return null
  const targetId = doc.states.some((s) => s.id === target) ? target : id

  return (
    <section>
      <Heading>State</Heading>
      <div className="space-y-3 text-sm">
        <label className="block">
          Label
          <input
            value={state.label}
            onChange={(e) => renameState(id, e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={doc.start === id}
            onChange={() => setStart(doc.start === id ? null : id)}
          />
          Start state
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={doc.accepting.includes(id)}
            onChange={() => toggleAccepting(id)}
          />
          Accepting state
        </label>
        <div className="flex items-end gap-2">
          <label className="flex-1">
            Add transition to
            <select
              value={targetId}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
            >
              {doc.states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.id === id ? ' (itself)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => openPrompt(id, targetId)}>
            Add…
          </button>
        </div>
        <button
          type="button"
          className="btn text-red-600 dark:text-red-400"
          onClick={() => deleteState(id)}
        >
          Delete state
        </button>
      </div>
    </section>
  )
}

function EdgeSection({ from, to }: { from: string; to: string }) {
  const doc = useStudioStore((s) => s.doc)
  const { openPrompt, deleteEdge } = useStudioStore.getState()
  const label = (id: string) => doc.states.find((s) => s.id === id)?.label ?? id
  const symbols = symbolsOfEdge(doc, from, to).map(formatSymbol).join(', ')
  return (
    <section>
      <Heading>Transition</Heading>
      <div className="space-y-3 text-sm">
        <p>
          {label(from)} → {label(to)} on <span className="font-mono font-semibold">{symbols}</span>
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn" onClick={() => openPrompt(from, to)}>
            Edit symbols…
          </button>
          <button
            type="button"
            className="btn text-red-600 dark:text-red-400"
            onClick={() => deleteEdge(from, to)}
          >
            Delete
          </button>
        </div>
      </div>
    </section>
  )
}
