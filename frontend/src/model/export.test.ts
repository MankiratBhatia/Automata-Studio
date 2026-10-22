import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { addState, emptyAutomaton, setEdgeSymbols, toggleAccepting } from './automaton'
import { fileStem, transitionTable } from './export'

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.automaton

describe('transitionTable (Markdown)', () => {
  it('writes a DFA with one state per cell, → for start and * for accepting', () => {
    expect(transitionTable(example('dfa_ends_with_01'), 'markdown')).toBe(
      [
        '| State | 0 | 1 |',
        '| :-- | :-: | :-: |',
        '| → q0 | q1 | q0 |',
        '| q1 | q1 | q2 |',
        '| * q2 | q1 | q0 |',
        '',
      ].join('\n'),
    )
  })

  it('writes NFA cells as sets, with ∅ where there is no move', () => {
    const t = transitionTable(example('nfa_third_last_a'), 'markdown').split('\n')
    expect(t[0]).toBe('| State | a | b |')
    expect(t[2]).toBe('| → q0 | {q0, q1} | {q0} |')
    expect(t[5]).toBe('| * q3 | ∅ | ∅ |')
  })

  it('adds an ε column for an ε-NFA', () => {
    const t = transitionTable(example('enfa_abb_thompson'), 'markdown').split('\n')
    expect(t[0]).toBe('| State | a | b | ε |')
    expect(t[2]).toBe('| → 0 | ∅ | ∅ | {1, 7} |')
  })

  it('shows a missing DFA transition as a dash, not as an empty set', () => {
    let d = addState(addState(emptyAutomaton('DFA'), { x: 0, y: 0 }), { x: 1, y: 1 })
    d = setEdgeSymbols(d, 'q0', 'q1', ['a'])
    expect(transitionTable(d, 'markdown')).toContain('| q1 | — |')
  })

  it('marks a state that is both start and accepting with →*', () => {
    const d = toggleAccepting(addState(emptyAutomaton('DFA'), { x: 0, y: 0 }), 'q0')
    expect(transitionTable(d, 'markdown')).toContain('| →* q0 |')
  })

  it('uses the labels shown on the canvas, not internal ids', () => {
    const t = transitionTable(example('dfa_ends_with_01'), 'markdown')
    const relabelled = {
      ...example('dfa_ends_with_01'),
      states: example('dfa_ends_with_01').states.map((s) => ({ ...s, label: s.id.toUpperCase() })),
    }
    expect(t).toContain('q0')
    expect(transitionTable(relabelled, 'markdown')).toContain('→ Q0')
  })

  it('escapes the pipe character so it cannot break the table', () => {
    const d = addState(emptyAutomaton('DFA'), { x: 0, y: 0 })
    d.states[0].label = 'a|b'
    expect(transitionTable(d, 'markdown')).toContain('a\\|b')
  })
})

describe('transitionTable (CSV)', () => {
  it('writes comma-separated rows with CRLF line endings', () => {
    // In "even number of 1s" the start state e is also accepting; o is neither.
    expect(transitionTable(example('dfa_even_ones'), 'csv')).toBe(
      'State,0,1\r\n→* e,e,o\r\no,o,e\r\n',
    )
  })

  it('quotes cells that contain commas, so NFA sets stay in one column', () => {
    const csv = transitionTable(example('nfa_third_last_a'), 'csv')
    expect(csv.split('\r\n')[1]).toBe('→ q0,"{q0, q1}",{q0}')
  })

  it('doubles any quotes inside a cell', () => {
    const d = addState(emptyAutomaton('DFA'), { x: 0, y: 0 })
    d.states[0].label = 'say "hi"'
    expect(transitionTable(d, 'csv')).toContain('"→ say ""hi"""')
  })
})

describe('fileStem', () => {
  it.each([
    ['Ends with 01', 'ends-with-01'],
    ['  (a|b)*abb  (Thompson) ', 'a-b-abb-thompson'],
    ['', 'automaton'],
    ['!!!', 'automaton'],
  ])('%j -> %s', (input, expected) => expect(fileStem(input)).toBe(expected))
})
