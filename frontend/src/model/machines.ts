import type { Pda, Tm } from '../api/types'
import type { Automaton } from './automaton'
import { nextStateId } from './automaton'

export type { Pda, Tm }
export type PdaTransition = Pda['transitions'][number]
export type TmTransition = Tm['transitions'][number]
export type Move = TmTransition['move']

/** Both machine types are a set of states with a start, so these helpers work on either. */
type Machine = Pda | Tm

/** The text a user types for "nothing": empty, or ε. */
const isNothing = (text: string) => text.trim() === '' || text.trim() === 'ε'

export const emptyPda = (): Pda => ({
  schemaVersion: 1,
  name: 'Untitled PDA',
  inputAlphabet: [],
  stackAlphabet: ['Z'],
  startStack: 'Z',
  acceptBy: 'finalState',
  states: [],
  start: null,
  accepting: [],
  transitions: [],
})

export const emptyTm = (): Tm => ({
  schemaVersion: 1,
  name: 'Untitled Turing machine',
  inputAlphabet: [],
  tapeAlphabet: ['_'],
  blank: '_',
  states: [],
  start: null,
  accepting: [],
  rejecting: [],
  transitions: [],
})

// --- states -------------------------------------------------------------------------------
// For machines a state's id and label are the same text, so renaming changes both.

export function addState<M extends Machine>(m: M): M {
  const id = nextStateId({ states: m.states } as Automaton)
  return { ...m, states: [...m.states, { id, label: id }], start: m.start ?? id }
}

export function removeState<M extends Machine>(m: M, id: string): M {
  const base = {
    ...m,
    states: m.states.filter((s) => s.id !== id),
    start: m.start === id ? null : m.start,
    accepting: m.accepting.filter((s) => s !== id),
    transitions: m.transitions.filter((t) => t.from !== id && t.to !== id),
  }
  return 'rejecting' in m ? { ...base, rejecting: m.rejecting.filter((s) => s !== id) } : base
}

/** Rename a state everywhere it is mentioned. Returns an error message if the name is unusable. */
export function renameState<M extends Machine>(
  m: M,
  id: string,
  next: string,
): { machine: M } | { error: string } {
  const name = next.trim()
  if (name === '') return { error: 'A state needs a name.' }
  if (name !== id && m.states.some((s) => s.id === name)) {
    return { error: `Another state is already called “${name}”.` }
  }
  const swap = (s: string) => (s === id ? name : s)
  const base = {
    ...m,
    states: m.states.map((s) => (s.id === id ? { ...s, id: name, label: name } : s)),
    start: m.start === null ? null : swap(m.start),
    accepting: m.accepting.map(swap),
    transitions: m.transitions.map((t) => ({ ...t, from: swap(t.from), to: swap(t.to) })),
  }
  return { machine: ('rejecting' in m ? { ...base, rejecting: m.rejecting.map(swap) } : base) as M }
}

export const setStart = <M extends Machine>(m: M, id: string | null): M => ({ ...m, start: id })

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((s) => s !== id) : [...list, id]

export const toggleAccepting = <M extends Machine>(m: M, id: string): M => ({
  ...m,
  accepting: toggle(m.accepting, id),
})

/** Turing machines only. A state cannot both accept and reject, so setting one clears the other. */
export function toggleRejecting(tm: Tm, id: string): Tm {
  const on = !tm.rejecting.includes(id)
  return {
    ...tm,
    rejecting: toggle(tm.rejecting, id),
    accepting: on ? tm.accepting.filter((s) => s !== id) : tm.accepting,
  }
}

export function setAccepting(tm: Tm, id: string): Tm {
  const on = !tm.accepting.includes(id)
  return {
    ...tm,
    accepting: toggle(tm.accepting, id),
    rejecting: on ? tm.rejecting.filter((s) => s !== id) : tm.rejecting,
  }
}

// --- transitions --------------------------------------------------------------------------

/** What the editor shows for a PDA move: ε for "nothing". */
export interface PdaRow {
  from: string
  to: string
  input: string
  pop: string
  push: string
}

export const pdaRow = (t: PdaTransition): PdaRow => ({
  from: t.from,
  to: t.to,
  input: t.input ?? '',
  pop: t.pop ?? '',
  push: t.push,
})

export function fromPdaRow(row: PdaRow): PdaTransition {
  return {
    from: row.from,
    to: row.to,
    input: isNothing(row.input) ? null : row.input.trim(),
    pop: isNothing(row.pop) ? null : row.pop.trim(),
    push: isNothing(row.push) ? '' : row.push.trim(),
  }
}

export function addPdaTransition(p: Pda): Pda {
  const state = p.start ?? p.states[0]?.id ?? ''
  const t: PdaTransition = { from: state, to: state, input: null, pop: null, push: '' }
  return { ...p, transitions: [...p.transitions, t] }
}

export const updatePdaTransition = (p: Pda, index: number, t: PdaTransition): Pda => ({
  ...p,
  transitions: p.transitions.map((x, i) => (i === index ? t : x)),
})

export function addTmTransition(tm: Tm): Tm {
  const state = tm.start ?? tm.states[0]?.id ?? ''
  const symbol = tm.tapeAlphabet[0] ?? tm.blank
  const t: TmTransition = { from: state, to: state, read: symbol, write: symbol, move: 'R' }
  return { ...tm, transitions: [...tm.transitions, t] }
}

export const updateTmTransition = (tm: Tm, index: number, t: TmTransition): Tm => ({
  ...tm,
  transitions: tm.transitions.map((x, i) => (i === index ? t : x)),
})

export const removeTransition = <M extends Machine>(m: M, index: number): M => ({
  ...m,
  transitions: m.transitions.filter((_, i) => i !== index) as M['transitions'],
})

// --- drawing a machine --------------------------------------------------------------------

export interface Diagram {
  /** The machine drawn as a plain state diagram, one multi-line label per pair of states. */
  doc: Automaton
  /** For each machine transition, the index of the drawn edge that carries it. */
  edgeOf: number[]
}

function diagram(
  m: Machine,
  label: (t: Machine['transitions'][number]) => string,
  stateLabel: (id: string) => string,
): Diagram {
  const groups = new Map<string, { from: string; to: string; lines: string[] }>()
  const edgeOf: number[] = []
  const order: string[] = []
  m.transitions.forEach((t, i) => {
    const key = JSON.stringify([t.from, t.to])
    if (!groups.has(key)) {
      groups.set(key, { from: t.from, to: t.to, lines: [] })
      order.push(key)
    }
    groups.get(key)!.lines.push(label(t))
    edgeOf[i] = order.indexOf(key)
  })
  const known = new Set(m.states.map((s) => s.id))
  const drawn = order.map((k) => groups.get(k)!).filter((g) => known.has(g.from) && known.has(g.to))
  return {
    doc: {
      schemaVersion: 1,
      kind: 'NFA',
      name: m.name,
      alphabet: [],
      states: m.states.map((s) => ({ id: s.id, label: stateLabel(s.id) })),
      start: m.start,
      accepting: m.accepting,
      transitions: drawn.map((g) => ({ from: g.from, to: g.to, symbol: g.lines.join('\n') })),
    },
    // Dropped (dangling) groups would shift the indices, so map through the kept ones.
    edgeOf: edgeOf.map((o) => {
      const g = groups.get(order[o])!
      return drawn.indexOf(g)
    }),
  }
}

/** `a,Z/AZ`: read a, pop Z, push AZ. ε stands for "nothing". */
export const pdaLabel = (t: PdaTransition): string =>
  `${t.input ?? 'ε'},${t.pop ?? 'ε'}/${t.push || 'ε'}`

/** `0/1,R`: on 0, write 1 and move right. */
export const tmLabel = (t: TmTransition): string => `${t.read}/${t.write},${t.move}`

export const pdaDiagram = (p: Pda): Diagram =>
  diagram(
    p,
    (t) => pdaLabel(t as PdaTransition),
    (id) => id,
  )

export const tmDiagram = (tm: Tm): Diagram =>
  diagram(
    tm,
    (t) => tmLabel(t as TmTransition),
    (id) => (tm.rejecting.includes(id) ? `${id} ✗` : id),
  )
