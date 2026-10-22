import { describe, expect, it } from 'vitest'
import type { Automaton, ConvertResponse } from '../api/types'
import { emptyAutomaton } from './automaton'
import { abbreviate, relabelResult, subsetKey } from './labels'

const doc = (kind: Automaton['kind'], states: [string, string?][]): Automaton => ({
  ...emptyAutomaton(kind),
  states: states.map(([id, label]) => ({ id, label: label ?? id })),
  start: states[0][0],
})
const res = (a: Automaton, stateMap?: Record<string, string[]>): ConvertResponse => ({
  automaton: a,
  steps: [],
  stateMap,
})
const labels = (a: Automaton) => a.states.map((s) => s.label)
const ids = (a: Automaton) => a.states.map((s) => s.id)

describe('relabelResult: subset construction', () => {
  const dfa = doc('DFA', [['{q0}'], ['{q0,q1}'], ['∅'], ['{q0,q1,q2}']])
  const out = relabelResult('nfa-to-dfa', null, res(dfa))

  it('letters the states in order and keeps the empty-set trap as ∅', () => {
    expect(labels(out)).toEqual(['A', 'B', '∅', 'C'])
  })

  it('never touches the ids, so the model stays self-describing', () => {
    expect(ids(out)).toEqual(ids(dfa))
  })

  it('carries on past Z', () => {
    const big = doc(
      'DFA',
      Array.from({ length: 28 }, (_, i) => [`{q${i}}`] as [string]),
    )
    const l = labels(relabelResult('nfa-to-dfa', null, res(big)))
    expect(l[25]).toBe('Z')
    expect(l[26]).toBe('S26')
    expect(new Set(l).size).toBe(28)
  })
})

describe('relabelResult: minimisation', () => {
  it('joins the labels of the merged source states', () => {
    const source = doc('DFA', [
      ['{q0}', 'A'],
      ['{q1}', 'B'],
      ['{q2}', 'C'],
    ])
    const merged = doc('DFA', [['{q0}'], ['{q1}={q2}']])
    const out = relabelResult(
      'minimize',
      source,
      res(merged, { '{q0}': ['{q0}'], '{q1}={q2}': ['{q1}', '{q2}'] }),
    )
    expect(labels(out)).toEqual(['A', 'B=C'])
  })

  it('falls back to the id for a trap state the source did not have', () => {
    const source = doc('DFA', [['p', 'P']])
    const out = relabelResult(
      'minimize',
      source,
      res(doc('DFA', [['p'], ['∅']]), { p: ['p'], '∅': ['∅'] }),
    )
    expect(labels(out)).toEqual(['P', '∅'])
  })
})

describe('relabelResult: other operations', () => {
  it('epsilon removal keeps custom labels', () => {
    const source = doc('ENFA', [
      ['q0', 'start'],
      ['q1', 'end'],
    ])
    expect(
      labels(relabelResult('remove-epsilon', source, res(doc('NFA', [['q0'], ['q1']])))),
    ).toEqual(['start', 'end'])
  })

  it('regex results keep their ids as labels', () => {
    expect(labels(relabelResult('regex', null, res(doc('ENFA', [['q0'], ['q1']]))))).toEqual([
      'q0',
      'q1',
    ])
  })
})

describe('subsetKey', () => {
  it('lists the NFA states behind each letter', () => {
    const d = relabelResult('nfa-to-dfa', null, res(doc('DFA', [['{q0}'], ['{q0,q1}'], ['∅']])))
    expect(subsetKey(d)).toEqual([
      { label: 'A', members: ['q0'] },
      { label: 'B', members: ['q0', 'q1'] },
    ])
  })

  it('is empty for anything that is not a lettered subset automaton', () => {
    expect(subsetKey(doc('DFA', [['q0'], ['q1']]))).toEqual([])
    // A minimised automaton has ids like {q0}={q1}; those are not pure subsets.
    expect(subsetKey(doc('DFA', [['{q0}={q1}', 'B=C']]))).toEqual([])
  })
})

describe('abbreviate', () => {
  it('leaves short names alone', () => {
    expect(abbreviate('Ends with 01')).toBe('Ends with 01')
  })

  it('keeps the end of a long name, where the stage suffix lives', () => {
    const a = abbreviate('Thompson: (a|b)*abb (DFA) (minimal)')
    expect(a.length).toBeLessThanOrEqual(26)
    expect(a.endsWith('(DFA) (minimal)')).toBe(true)
    expect(a).toContain('…')
    expect(abbreviate('Thompson: (a|b)*abb (DFA)')).not.toBe(
      abbreviate('Thompson: (a|b)*abb (DFA) (minimal)'),
    )
  })
})
