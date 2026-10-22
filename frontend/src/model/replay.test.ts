import { describe, expect, it } from 'vitest'
import type { Step } from '../api/types'
import { emptyAutomaton, type Automaton } from './automaton'
import {
  builtAt,
  friendlyText,
  groupsAt,
  partitionAt,
  readableStep,
  replayFor,
  subsetTable,
  type ConversionRecord,
} from './replay'

const step = (index: number, extra: Partial<Step> = {}): Step => ({
  index,
  title: `step ${index}`,
  detail: '',
  states: [],
  transitions: [],
  addsStates: [],
  addsTransitions: [],
  round: null,
  ...extra,
})

const auto = (
  kind: Automaton['kind'],
  states: [string, string][],
  transitions: [string, string, string | null][] = [],
  accepting: string[] = [],
): Automaton => ({
  ...emptyAutomaton(kind),
  alphabet: [...new Set(transitions.flatMap(([, , c]) => (c ? [c] : [])))],
  states: states.map(([id, label]) => ({ id, label, position: { x: 0, y: 0 } })),
  start: states[0][0],
  accepting,
  transitions: transitions.map(([from, to, symbol]) => ({ from, to, symbol })),
})

// Subset construction of a tiny NFA: p -a-> p, p -a-> q   (q accepting)
const subset: ConversionRecord = {
  op: 'nfa-to-dfa',
  source: auto(
    'NFA',
    [
      ['p', 'p'],
      ['q', 'q'],
    ],
    [
      ['p', 'p', 'a'],
      ['p', 'q', 'a'],
    ],
    ['q'],
  ),
  result: auto(
    'DFA',
    [
      ['{p}', 'A'],
      ['{p,q}', 'B'],
    ],
    [
      ['{p}', '{p,q}', 'a'],
      ['{p,q}', '{p,q}', 'a'],
    ],
    ['{p,q}'],
  ),
  stateMap: { '{p}': ['p'], '{p,q}': ['p', 'q'] },
  rounds: null,
  steps: [
    step(0, { addsStates: ['{p}'], states: ['p'] }),
    step(1, { addsStates: ['{p,q}'], addsTransitions: [0], states: ['p'], transitions: [0, 1] }),
    step(2, { addsTransitions: [1], states: ['p', 'q'], transitions: [0, 1] }),
    step(3),
  ],
}

describe('builtAt', () => {
  it('accumulates what each step adds, up to and including the index', () => {
    expect([...builtAt(subset, 0).states]).toEqual(['{p}'])
    expect([...builtAt(subset, 1).states]).toEqual(['{p}', '{p,q}'])
    expect([...builtAt(subset, 1).transitions]).toEqual([0])
    expect([...builtAt(subset, 3).transitions]).toEqual([0, 1])
  })

  it('clamps an out-of-range index', () => {
    expect(builtAt(subset, 99).states.size).toBe(2)
    expect(builtAt(subset, -5).states.size).toBe(1)
  })
})

describe('subsetTable', () => {
  it('starts with just the start row and no discovered moves', () => {
    const [row, ...rest] = subsetTable(subset, 0)
    expect(rest).toEqual([])
    expect(row).toMatchObject({ label: 'A', isStart: true, accepting: false, members: ['p'] })
    expect(row.cells).toEqual([{ symbol: 'a', target: null, current: false }])
  })

  it('fills in a move and flags it as the current one', () => {
    const rows = subsetTable(subset, 1)
    expect(rows.map((r) => r.label)).toEqual(['A', 'B'])
    expect(rows[0].cells[0]).toEqual({ symbol: 'a', target: 'B', current: true })
    expect(rows[1].cells[0].target).toBeNull() // B's own move is not discovered until step 2
  })

  it('stops highlighting a move once the next step has run', () => {
    const rows = subsetTable(subset, 2)
    expect(rows[0].cells[0].current).toBe(false)
    expect(rows[1].cells[0]).toEqual({ symbol: 'a', target: 'B', current: true })
  })

  it('names the NFA states each row stands for, and marks accepting rows', () => {
    const rows = subsetTable(subset, 3)
    expect(rows[1]).toMatchObject({ members: ['p', 'q'], accepting: true, isStart: false })
  })
})

describe('replayFor', () => {
  it('shows the source NFA with the step highlighted while building the DFA', () => {
    const r = replayFor(subset, 1)
    expect(r.doc).toBe(subset.source)
    expect([...r.view.activeStates!]).toEqual(['p'])
    expect([...r.view.activeTransitions!]).toEqual([0, 1])
    expect(r.view.builtStates).toBeUndefined() // the source is always fully drawn
  })

  it('for a regex, shows the result growing and highlights the new fragment', () => {
    const enfa: ConversionRecord = {
      op: 'regex',
      source: null,
      result: auto(
        'ENFA',
        [
          ['q0', 'q0'],
          ['q1', 'q1'],
        ],
        [['q0', 'q1', 'a']],
        ['q1'],
      ),
      stateMap: null,
      rounds: null,
      steps: [
        step(0, {
          states: ['q0', 'q1'],
          transitions: [0],
          addsStates: ['q0', 'q1'],
          addsTransitions: [0],
        }),
        step(1),
      ],
    }
    const r = replayFor(enfa, 0)
    expect(r.doc).toBe(enfa.result)
    expect([...r.view.builtStates!]).toEqual(['q0', 'q1'])
    expect([...r.view.builtTransitions!]).toEqual([0])
    expect([...r.view.activeStates!]).toEqual(['q0', 'q1'])
  })
})

// Minimisation of A B C D where B ~ C
const minimize: ConversionRecord = {
  op: 'minimize',
  source: auto('DFA', [
    ['A', 'A'],
    ['B', 'B'],
    ['C', 'C'],
    ['D', 'D'],
  ]),
  result: auto('DFA', [
    ['A', 'A'],
    ['B=C', 'B=C'],
    ['D', 'D'],
  ]),
  stateMap: null,
  rounds: [
    [['D'], ['A', 'B', 'C']],
    [['D'], ['A'], ['B', 'C']],
  ],
  steps: [
    step(0),
    step(1, { round: 0 }),
    step(2, { round: 1, states: ['A', 'B', 'C'] }),
    step(3, { round: 1 }),
  ],
}

describe('partitions', () => {
  it('colours states by their block in the round the step shows', () => {
    expect([...groupsAt(minimize, 1)]).toEqual([
      ['D', 0],
      ['A', 1],
      ['B', 2],
      ['C', 2],
    ])
    const r = replayFor(minimize, 2)
    expect(r.view.groups?.get('B')).toBe(r.view.groups?.get('C'))
    expect(r.view.groups?.get('A')).not.toBe(r.view.groups?.get('B'))
  })

  it('has no colouring before the first partition exists', () => {
    expect(replayFor(minimize, 0).view.groups).toBeUndefined()
    expect(partitionAt(minimize, 0)).toBeNull()
  })

  it('lists the blocks of the current round with their colour numbers', () => {
    expect(partitionAt(minimize, 1)).toEqual([
      { states: ['D'], color: 0, isNew: false },
      { states: ['A', 'B', 'C'], color: 1, isNew: false },
    ])
  })

  it('marks blocks created by the latest split as new', () => {
    const blocks = partitionAt(minimize, 2)!
    expect(blocks.map((b) => [b.states.join(''), b.isNew])).toEqual([
      ['D', false], // survived unchanged
      ['A', true],
      ['BC', true],
    ])
  })
})

describe('friendlyText', () => {
  const lettered: ConversionRecord = {
    ...subset,
    result: auto(
      'DFA',
      [
        ['{p}', 'A'],
        ['{p,q}', 'B'],
        ['{p,q,r}', 'C'],
      ],
      [['{p}', '{p,q}', 'a']],
    ),
    steps: [
      step(0, {
        title: "{p,q,r} on 'a'",
        detail: 'move = {p, q}; closure = {p,q} → new state {p,q}',
      }),
    ],
  }

  it('swaps long subset ids for the letters shown on screen', () => {
    expect(readableStep(lettered, 0)).toEqual({
      title: "C on 'a'",
      detail: 'move = {p, q}; closure = B → new state B',
    })
  })

  it('does not let a short id clobber the front of a longer one', () => {
    expect(friendlyText(lettered, '{p,q,r} and {p,q} and {p}')).toBe('C and B and A')
  })

  it('leaves text alone when ids and labels already agree', () => {
    expect(friendlyText(minimize, '{A, B} splits into {A} | {B}')).toBe(
      '{A, B} splits into {A} | {B}',
    )
  })

  it('for minimisation, speaks in the labels of the automaton being minimised', () => {
    const source = auto('DFA', [
      ['{x}', 'A'],
      ['{y}', 'B'],
    ])
    const rec: ConversionRecord = {
      ...minimize,
      source,
      steps: [step(0, { title: '{{x}, {y}} splits' })],
    }
    expect(readableStep(rec, 0).title).toBe('{A, B} splits')
  })
})
