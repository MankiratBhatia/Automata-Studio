import { describe, expect, it } from 'vitest'
import {
  addState,
  addTrapState,
  edgeLabel,
  emptyAutomaton,
  groupTransitions,
  moveState,
  nextStateId,
  parseAlphabet,
  parseSymbols,
  removeEdge,
  removeState,
  setEdgeSymbols,
  toggleAccepting,
  type Automaton,
} from './automaton'

const at = { x: 0, y: 0 }

function build(): Automaton {
  let d = emptyAutomaton('NFA')
  d = addState(d, at)
  d = addState(d, at)
  d = setEdgeSymbols(d, 'q0', 'q1', ['a', 'b'])
  d = setEdgeSymbols(d, 'q1', 'q0', ['a'])
  d = setEdgeSymbols(d, 'q1', 'q1', ['b'])
  return toggleAccepting(d, 'q1')
}

describe('states', () => {
  it('makes the first state the start state, later ones not', () => {
    const d = addState(addState(emptyAutomaton(), at), at)
    expect(d.states.map((s) => s.id)).toEqual(['q0', 'q1'])
    expect(d.start).toBe('q0')
  })

  it('reuses the smallest free id after a deletion', () => {
    let d = addState(addState(addState(emptyAutomaton(), at), at), at)
    d = removeState(d, 'q1')
    expect(nextStateId(d)).toBe('q1')
  })

  it('removing a state also removes its transitions, accepting flag and start', () => {
    const d = removeState(build(), 'q0')
    expect(d.states.map((s) => s.id)).toEqual(['q1'])
    expect(d.start).toBeNull()
    expect(d.transitions).toEqual([{ from: 'q1', to: 'q1', symbol: 'b' }])
    expect(removeState(build(), 'q1').accepting).toEqual([])
  })

  it('never mutates its input', () => {
    const d = build()
    const snapshot = JSON.stringify(d)
    moveState(d, 'q0', { x: 9, y: 9 })
    removeState(d, 'q0')
    toggleAccepting(d, 'q0')
    expect(JSON.stringify(d)).toBe(snapshot)
  })

  it('toggles accepting on and off', () => {
    const on = toggleAccepting(emptyAutomaton(), 'q0')
    expect(on.accepting).toEqual(['q0'])
    expect(toggleAccepting(on, 'q0').accepting).toEqual([])
  })
})

describe('transitions', () => {
  it('groups symbols that share endpoints into one edge', () => {
    const groups = groupTransitions(build())
    expect(groups).toHaveLength(3)
    const ab = groups.find((g) => g.from === 'q0' && g.to === 'q1')!
    expect(edgeLabel(ab)).toBe('a, b')
    expect(ab.indices).toEqual([0, 1])
  })

  it('keeps A->B and B->A as separate groups', () => {
    const groups = groupTransitions(build())
    expect(groups.some((g) => g.from === 'q1' && g.to === 'q0')).toBe(true)
  })

  it('setEdgeSymbols replaces the previous symbols of that edge only', () => {
    const d = setEdgeSymbols(build(), 'q0', 'q1', ['b'])
    expect(d.transitions.filter((t) => t.from === 'q0' && t.to === 'q1')).toEqual([
      { from: 'q0', to: 'q1', symbol: 'b' },
    ])
    expect(d.transitions.some((t) => t.from === 'q1' && t.to === 'q0')).toBe(true)
  })

  it('adds new symbols to the alphabet exactly once', () => {
    const d = setEdgeSymbols(build(), 'q0', 'q0', ['z', 'z'])
    expect(d.alphabet.filter((s) => s === 'z')).toHaveLength(1)
  })

  it('removeEdge drops every symbol on that edge', () => {
    const d = removeEdge(build(), 'q0', 'q1')
    expect(d.transitions.some((t) => t.from === 'q0' && t.to === 'q1')).toBe(false)
    expect(d.transitions).toHaveLength(2)
  })

  it('labels epsilon as ε', () => {
    const d = setEdgeSymbols(emptyAutomaton('ENFA'), 'q0', 'q1', [null, 'a'])
    expect(edgeLabel(groupTransitions(d)[0])).toBe('ε, a')
  })
})

describe('parseSymbols', () => {
  it('accepts commas and spaces', () => {
    expect(parseSymbols('a, b  c', 'NFA')).toEqual({ symbols: ['a', 'b', 'c'], error: null })
  })

  it('de-duplicates', () => {
    expect(parseSymbols('a,a', 'NFA').symbols).toEqual(['a'])
  })

  it('turns epsilon spellings into null in an ENFA', () => {
    expect(parseSymbols('ε, eps, a', 'ENFA').symbols).toEqual([null, 'a'])
  })

  it('refuses epsilon outside an ENFA with a helpful message', () => {
    expect(parseSymbols('ε', 'DFA').error).toMatch(/ε-NFA/)
  })

  it('refuses multi-character tokens and empty input', () => {
    expect(parseSymbols('ab', 'NFA').error).toMatch(/single character/)
    expect(parseSymbols('  ', 'NFA').error).toMatch(/at least one/)
  })

  it('parseAlphabet splits into unique characters', () => {
    expect(parseAlphabet('0, 1 1')).toEqual(['0', '1'])
  })
})

describe('addTrapState', () => {
  const incomplete = (): Automaton => {
    let d = addState(addState(emptyAutomaton('DFA'), at), { x: 100, y: 0 })
    d = setEdgeSymbols(d, 'q0', 'q1', ['a'])
    return { ...d, alphabet: ['a', 'b'] }
  }

  it('sends every missing pair to a looping, non-accepting trap', () => {
    const d = addTrapState(incomplete())
    expect(d.states.map((s) => s.id)).toEqual(['q0', 'q1', 'trap'])
    expect(d.accepting).toEqual([])
    const out = (from: string) =>
      d.transitions.filter((t) => t.from === from).map((t) => `${t.symbol}>${t.to}`)
    expect(out('q0').sort()).toEqual(['a>q1', 'b>trap'])
    expect(out('q1').sort()).toEqual(['a>trap', 'b>trap'])
    expect(out('trap').sort()).toEqual(['a>trap', 'b>trap'])
  })

  it('leaves a complete DFA untouched', () => {
    const d = addTrapState(incomplete())
    expect(addTrapState(d)).toBe(d)
  })

  it('picks an unused id', () => {
    let d = incomplete()
    d = { ...d, states: [...d.states, { id: 'trap', label: 'trap', position: at }] }
    expect(addTrapState(d).states.map((s) => s.id)).toContain('trap2')
  })
})
