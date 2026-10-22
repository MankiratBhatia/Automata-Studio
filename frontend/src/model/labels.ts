import type { Automaton, ConvertResponse } from '../api/types'

export type ConversionOp = 'regex' | 'remove-epsilon' | 'nfa-to-dfa' | 'minimize'

/**
 * The backend names result states after what they stand for (`{q0,q1}`, `B=C`): exact, but too
 * long to read inside a circle. The model keeps those ids; the *label* shown on the canvas is
 * what we choose here.
 *
 *  - subset construction: A, B, C, ... in discovery order (the empty-set trap stays ∅);
 *    the "state key" in the UI explains each letter
 *  - minimisation: the merged states' labels joined with "=", e.g. B=C
 *  - epsilon removal: the source state's label is kept
 */
export function relabelResult(
  op: ConversionOp,
  source: Automaton | null,
  res: ConvertResponse,
): Automaton {
  const result = res.automaton
  const sourceLabel = new Map(source?.states.map((s) => [s.id, s.label]))
  const labelFor = (id: string, index: number): string => {
    if (op === 'nfa-to-dfa') return id === '∅' ? id : indexName(index)
    if (op === 'minimize') {
      const members = res.stateMap?.[id]
      return members ? members.map((m) => sourceLabel.get(m) ?? m).join('=') : id
    }
    if (op === 'remove-epsilon') return sourceLabel.get(id) ?? id
    return id
  }

  let lettered = 0
  return {
    ...result,
    states: result.states.map((s) => ({
      ...s,
      label: labelFor(s.id, s.id === '∅' ? 0 : lettered++),
    })),
  }
}

/** A, B, ..., Z, then S26, S27, ... */
function indexName(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `S${i}`
}

const SUBSET_ID = /^\{[^{}]*\}$/

export interface KeyRow {
  label: string
  members: string[]
}

/**
 * Which NFA states each lettered DFA state stands for, read straight from the state ids.
 * Empty unless the automaton came out of subset construction.
 */
export function subsetKey(doc: Automaton): KeyRow[] {
  return doc.states
    .filter((s) => SUBSET_ID.test(s.id) && s.label !== s.id)
    .map((s) => ({ label: s.label, members: s.id.slice(1, -1).split(',').filter(Boolean) }))
}

/** Shorten a long tab title while keeping its distinguishing end, e.g. "Thompson: …(DFA) (minimal)". */
export function abbreviate(name: string, max = 26): string {
  if (name.length <= max) return name
  const tail = Math.floor((max - 1) * 0.6)
  return `${name.slice(0, max - 1 - tail)}…${name.slice(-tail)}`
}

/** How a counterexample reads: the empty string needs a name, since "" is invisible. */
export const showWord = (w: string): string => (w === '' ? 'ε (the empty string)' : `“${w}”`)
