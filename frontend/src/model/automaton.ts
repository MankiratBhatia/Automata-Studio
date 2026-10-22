import type { Automaton } from '../api/types'

export type { Automaton }
export type Kind = Automaton['kind']
export type Transition = Automaton['transitions'][number]

/** All helpers are pure: they return a new automaton and never mutate their input. */

export const EPSILON = 'ε'

export function emptyAutomaton(kind: Kind = 'DFA'): Automaton {
  return {
    schemaVersion: 1,
    kind,
    name: 'Untitled',
    alphabet: [],
    states: [],
    start: null,
    accepting: [],
    transitions: [],
  }
}

/** Smallest unused `q<n>` id. */
export function nextStateId(doc: Automaton): string {
  const used = new Set(doc.states.map((s) => s.id))
  let n = 0
  while (used.has(`q${n}`)) n++
  return `q${n}`
}

export function addState(doc: Automaton, position: { x: number; y: number }): Automaton {
  const id = nextStateId(doc)
  return {
    ...doc,
    states: [...doc.states, { id, label: id, position }],
    // The first state is the start state, so a fresh drawing is runnable straight away.
    start: doc.start ?? id,
  }
}

export function removeState(doc: Automaton, id: string): Automaton {
  return {
    ...doc,
    states: doc.states.filter((s) => s.id !== id),
    start: doc.start === id ? null : doc.start,
    accepting: doc.accepting.filter((s) => s !== id),
    transitions: doc.transitions.filter((t) => t.from !== id && t.to !== id),
  }
}

export function moveState(
  doc: Automaton,
  id: string,
  position: { x: number; y: number },
): Automaton {
  return { ...doc, states: doc.states.map((s) => (s.id === id ? { ...s, position } : s)) }
}

export function renameState(doc: Automaton, id: string, label: string): Automaton {
  return { ...doc, states: doc.states.map((s) => (s.id === id ? { ...s, label } : s)) }
}

export function setStart(doc: Automaton, id: string | null): Automaton {
  return { ...doc, start: id }
}

export function toggleAccepting(doc: Automaton, id: string): Automaton {
  const accepting = doc.accepting.includes(id)
    ? doc.accepting.filter((s) => s !== id)
    : [...doc.accepting, id]
  return { ...doc, accepting }
}

export function setKind(doc: Automaton, kind: Kind): Automaton {
  return { ...doc, kind }
}

export function setName(doc: Automaton, name: string): Automaton {
  return { ...doc, name }
}

export function setAlphabet(doc: Automaton, alphabet: string[]): Automaton {
  return { ...doc, alphabet }
}

// --- symbols --------------------------------------------------------------------------

const EPSILON_WORDS = new Set(['ε', 'eps', 'epsilon', 'λ', 'lambda'])

export type ParsedSymbols =
  { symbols: (string | null)[]; error: null } | { symbols: []; error: string }

/**
 * Parse what a user types into a transition label: "a, b" or "a b" or "ε".
 * Symbols are single characters; ε (or eps/epsilon/λ) becomes `null`.
 */
export function parseSymbols(input: string, kind: Kind): ParsedSymbols {
  const tokens = input.split(/[\s,]+/).filter(Boolean)
  if (tokens.length === 0) return { symbols: [], error: 'Enter at least one symbol.' }
  const out: (string | null)[] = []
  for (const tok of tokens) {
    if (EPSILON_WORDS.has(tok.toLowerCase())) {
      if (kind !== 'ENFA')
        return { symbols: [], error: `Epsilon transitions need an ε-NFA, not a ${kind}.` }
      out.push(null)
    } else if ([...tok].length === 1) {
      out.push(tok)
    } else {
      return {
        symbols: [],
        error: `"${tok}" is not a single character. Separate symbols with commas.`,
      }
    }
  }
  return { symbols: [...new Set(out)], error: null }
}

export const formatSymbol = (s: string | null): string => (s === null ? EPSILON : s)

// --- transitions ----------------------------------------------------------------------

export interface EdgeGroup {
  from: string
  to: string
  symbols: (string | null)[]
  /** Indices into `doc.transitions`, in the same order as `symbols`. */
  indices: number[]
}

/** Merge transitions that share (from, to) so the canvas draws one edge labelled "a, b". */
export function groupTransitions(doc: Automaton): EdgeGroup[] {
  const groups = new Map<string, EdgeGroup>()
  doc.transitions.forEach((t, i) => {
    const key = JSON.stringify([t.from, t.to])
    const g = groups.get(key) ?? { from: t.from, to: t.to, symbols: [], indices: [] }
    g.symbols.push(t.symbol)
    g.indices.push(i)
    groups.set(key, g)
  })
  return [...groups.values()]
}

export const edgeLabel = (g: EdgeGroup): string => g.symbols.map(formatSymbol).join(', ')

/** Make the (from, to) edge carry exactly `symbols`. New symbols join the alphabet. */
export function setEdgeSymbols(
  doc: Automaton,
  from: string,
  to: string,
  input: (string | null)[],
): Automaton {
  const symbols = [...new Set(input)]
  const others = doc.transitions.filter((t) => !(t.from === from && t.to === to))
  const mine = symbols.map((symbol) => ({ from, to, symbol }))
  const known = new Set(doc.alphabet)
  const added = symbols.filter((s): s is string => s !== null && !known.has(s))
  return {
    ...doc,
    alphabet: [...doc.alphabet, ...added],
    transitions: [...others, ...mine],
  }
}

export function removeEdge(doc: Automaton, from: string, to: string): Automaton {
  return { ...doc, transitions: doc.transitions.filter((t) => !(t.from === from && t.to === to)) }
}

export function symbolsOfEdge(doc: Automaton, from: string, to: string): (string | null)[] {
  return doc.transitions.filter((t) => t.from === from && t.to === to).map((t) => t.symbol)
}

/** Parse "ab", "a, b" or "0 1" into a de-duplicated list of single characters. */
export function parseAlphabet(input: string): string[] {
  return [...new Set([...input.replace(/[\s,]+/g, '')])]
}

/**
 * Make a DFA complete: add a non-accepting trap state and send every missing
 * (state, symbol) pair to it. Returns the input unchanged if nothing is missing.
 */
export function addTrapState(doc: Automaton): Automaton {
  const have = new Set(doc.transitions.map((t) => `${t.from}\u0000${t.symbol}`))
  const missing = doc.states.flatMap((s) =>
    doc.alphabet
      .filter((c) => !have.has(`${s.id}\u0000${c}`))
      .map((c) => ({ from: s.id, symbol: c })),
  )
  if (missing.length === 0) return doc

  const used = new Set(doc.states.map((s) => s.id))
  let id = 'trap'
  for (let n = 2; used.has(id); n++) id = `trap${n}`

  const xs = doc.states.map((s) => s.position?.x ?? 0)
  const ys = doc.states.map((s) => s.position?.y ?? 0)
  const position = {
    x: Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1)),
    y: Math.max(...ys, 0) + 130,
  }
  return {
    ...doc,
    states: [...doc.states, { id, label: id, position }],
    transitions: [
      ...doc.transitions,
      ...missing.map((m) => ({ from: m.from, to: id, symbol: m.symbol })),
      ...doc.alphabet.map((c) => ({ from: id, to: id, symbol: c })),
    ],
  }
}
