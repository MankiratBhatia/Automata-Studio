import { useState } from 'react'
import type { Issue } from '../api/types'
import { parseAlphabet } from '../model/automaton'
import { SPEEDS, useMachineStore, type SpeedId } from './useMachineStore'

export const HEADING =
  'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400'
export const FIELD =
  'mt-1 w-full rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600'
export const CELL =
  'w-full rounded border border-slate-300 bg-transparent px-1 py-0.5 font-mono text-sm dark:border-slate-600'
export const SELECT = `${CELL} dark:bg-slate-900`

/** A text field that commits when you leave it, like the finite-automata alphabet field. */
export function TextField({
  label,
  value,
  onCommit,
  placeholder,
  hint,
  mono,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  hint?: string
  mono?: boolean
}) {
  // `null` means "not editing": show the real value, so outside changes appear at once.
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <label className="block text-sm">
      {label}
      <input
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        placeholder={placeholder}
        spellCheck={false}
        className={`${FIELD} ${mono ? 'font-mono' : ''}`}
      />
      {hint && <span className="text-xs text-slate-600 dark:text-slate-400">{hint}</span>}
    </label>
  )
}

/** Symbols typed as "a, b" or "ab"; each must be one character. */
export function AlphabetField(props: {
  label: string
  value: string[]
  onCommit: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <TextField
      label={props.label}
      value={props.value.join(', ')}
      onCommit={(text) => props.onCommit(parseAlphabet(text))}
      placeholder={props.placeholder}
      hint="Single characters. Applied when you leave the field."
      mono
    />
  )
}

interface StatesProps {
  states: { id: string }[]
  start: string | null
  accepting: string[]
  /** Only Turing machines have rejecting states. */
  rejecting?: string[]
  onAdd: () => void
  /** Returns an error message, or null if the rename worked. */
  onRename: (id: string, name: string) => string | null
  onRemove: (id: string) => void
  onStart: (id: string) => void
  onAccepting: (id: string) => void
  onRejecting?: (id: string) => void
}

export function StatesEditor(p: StatesProps) {
  return (
    <section aria-label="States">
      <h3 className={HEADING}>States</h3>
      {p.states.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">No states yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-600 dark:text-slate-400">
              <th scope="col" className="py-1 font-medium">
                Name
              </th>
              <th scope="col" className="px-1 font-medium">
                Start
              </th>
              <th scope="col" className="px-1 font-medium">
                Accept
              </th>
              {p.rejecting && (
                <th scope="col" className="px-1 font-medium">
                  Reject
                </th>
              )}
              <th scope="col" className="sr-only">
                Delete
              </th>
            </tr>
          </thead>
          <tbody>
            {p.states.map((s) => (
              <StateRow key={s.id} id={s.id} {...p} />
            ))}
          </tbody>
        </table>
      )}
      <button type="button" className="btn mt-2" onClick={p.onAdd}>
        Add state
      </button>
    </section>
  )
}

function StateRow({ id, ...p }: StatesProps & { id: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    setError(draft === id ? null : p.onRename(id, draft))
    setDraft(null) // on an error the real name comes back, with the reason shown beneath
  }
  return (
    <tr className="border-t border-slate-200 align-top dark:border-slate-700">
      <td className="py-1 pr-1">
        <input
          aria-label={`Name of state ${id}`}
          aria-invalid={error !== null}
          value={draft ?? id}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className={CELL}
        />
        {error && (
          <p role="alert" className="mt-0.5 text-xs text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </td>
      <td className="px-1 pt-2 text-center">
        <input
          type="radio"
          name="start-state"
          aria-label={`${id} is the start state`}
          checked={p.start === id}
          onChange={() => p.onStart(id)}
        />
      </td>
      <td className="px-1 pt-2 text-center">
        <input
          type="checkbox"
          aria-label={`${id} is an accepting state`}
          checked={p.accepting.includes(id)}
          onChange={() => p.onAccepting(id)}
        />
      </td>
      {p.rejecting && p.onRejecting && (
        <td className="px-1 pt-2 text-center">
          <input
            type="checkbox"
            aria-label={`${id} is a rejecting state`}
            checked={p.rejecting.includes(id)}
            onChange={() => p.onRejecting?.(id)}
          />
        </td>
      )}
      <td className="pl-1 pt-0.5 text-right">
        <button
          type="button"
          aria-label={`Delete state ${id}`}
          title={`Delete state ${id}`}
          onClick={() => p.onRemove(id)}
          className="rounded px-1.5 text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          ×
        </button>
      </td>
    </tr>
  )
}

export function IssueList({ issues, error }: { issues: Issue[] | null; error: string | null }) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-amber-800 dark:text-amber-300">
        Checking is unavailable: {error}
      </p>
    )
  }
  if (!issues) return null
  if (issues.length === 0) {
    return <p className="text-sm text-emerald-800 dark:text-emerald-300">No problems found.</p>
  }
  return (
    <ul className="space-y-1.5" aria-label="Problems">
      {issues.map((i, n) => (
        <li
          key={`${i.code}-${n}`}
          className="rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700"
        >
          <span
            className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold uppercase ${
              i.severity === 'error' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-950'
            }`}
          >
            {i.severity}
          </span>
          {i.message}
        </li>
      ))}
    </ul>
  )
}

export function SpeedSelect({ kind }: { kind: 'pda' | 'tm' }) {
  const speed = useMachineStore((s) => (kind === 'pda' ? s.pdaRun.speed : s.tmRun.speed))
  const setSpeed = useMachineStore.getState().setSpeed
  return (
    <label className="flex items-center gap-2 text-sm">
      Speed
      <select
        value={speed}
        onChange={(e) => setSpeed(kind, e.target.value as SpeedId)}
        className="rounded-md border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
      >
        {SPEEDS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  )
}
