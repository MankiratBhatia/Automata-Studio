import { describe, expect, it } from 'vitest'
import { EXAMPLES } from '../examples'
import { addState, emptyAutomaton, setEdgeSymbols } from '../model/automaton'
import { NO_VIEW, stabilize, toFlow, type CanvasView } from './canvasMapping'
import { BIDIRECTIONAL_BOW } from './edgeGeometry'

const example = (id: string) => EXAMPLES.find((e) => e.id === id)!.automaton
const view = (v: Partial<CanvasView>): CanvasView => ({ ...NO_VIEW, ...v })

describe('toFlow', () => {
  it('makes one node per state and marks start and accepting', () => {
    const { nodes } = toFlow(example('dfa_ends_with_01'))
    expect(nodes.map((n) => n.id)).toEqual(['q0', 'q1', 'q2'])
    expect(nodes.find((n) => n.id === 'q0')!.data).toMatchObject({
      isStart: true,
      isAccepting: false,
    })
    expect(nodes.find((n) => n.id === 'q2')!.data).toMatchObject({
      isStart: false,
      isAccepting: true,
    })
  })

  it('draws one edge per (from, to) pair with symbols merged into the label', () => {
    let d = addState(addState(emptyAutomaton('NFA'), { x: 0, y: 0 }), { x: 9, y: 9 })
    d = setEdgeSymbols(d, 'q0', 'q1', ['a', 'b'])
    const { edges } = toFlow(d)
    expect(edges).toHaveLength(1)
    expect(edges[0].data!.label).toBe('a, b')
  })

  it('marks self-loops', () => {
    const { edges } = toFlow(example('dfa_ends_with_01'))
    expect(edges.filter((e) => e.data!.selfLoop).map((e) => e.id)).toEqual(['q0→q0', 'q1→q1'])
  })

  it('curves both edges of a bidirectional pair, plus any edge that would cross a state', () => {
    const { edges } = toFlow(example('dfa_ends_with_01'))
    const bowed = edges.filter((e) => e.data!.bow !== 0).map((e) => e.id)
    // q2→q0 would run straight through q1, so it detours too.
    expect(bowed).toEqual(['q1→q2', 'q2→q1', 'q2→q0'])
    expect(edges.find((e) => e.id === 'q1→q2')!.data!.bow).toBe(BIDIRECTIONAL_BOW)
    expect(edges.find((e) => e.id === 'q0→q1')!.data!.bow).toBe(0)
  })

  it('does not curve a self-loop even though its reverse "exists"', () => {
    const { edges } = toFlow(example('dfa_even_ones'))
    expect(edges.find((e) => e.id === 'e→e')!.data!.bow).toBe(0)
  })

  it('shows epsilon edges with ε', () => {
    const { edges } = toFlow(example('enfa_abb_thompson'))
    expect(edges.find((e) => e.id === '0→1')!.data!.label).toBe('ε')
  })

  it('skips transitions that point at missing states instead of crashing React Flow', () => {
    const d = {
      ...example('dfa_even_ones'),
      transitions: [{ from: 'e', to: 'ghost', symbol: '0' }],
    }
    expect(toFlow(d).edges).toEqual([])
  })

  it('applies selection, simulation and validation highlights', () => {
    const d = example('dfa_ends_with_01')
    const { nodes, edges } = toFlow(
      d,
      view({
        selection: { kind: 'edge', from: 'q0', to: 'q1' },
        activeStates: new Set(['q1']),
        activeTransitions: new Set([0]), // q0 --0--> q1
        flaggedStates: new Set(['q2']),
      }),
    )
    expect(nodes.find((n) => n.id === 'q1')!.data.active).toBe(true)
    expect(nodes.find((n) => n.id === 'q0')!.data.active).toBe(false)
    expect(nodes.find((n) => n.id === 'q2')!.data.flagged).toBe(true)
    const e = edges.find((x) => x.id === 'q0→q1')!
    expect(e.selected).toBe(true)
    expect(e.data!.active).toBe(true)
    expect(edges.find((x) => x.id === 'q0→q0')!.data!.active).toBe(false)
  })

  it('lights an edge when any of its grouped transitions is used', () => {
    const d = setEdgeSymbols(
      addState(addState(emptyAutomaton('NFA'), { x: 0, y: 0 }), { x: 9, y: 9 }),
      'q0',
      'q1',
      ['a', 'b'],
    )
    const { edges } = toFlow(d, view({ activeTransitions: new Set([1]) })) // only the 'b' one
    expect(edges[0].data!.active).toBe(true)
  })

  it('points a self-loop away from its neighbours', () => {
    // Neighbours above means the loop goes below, and vice versa.
    let d = addState(addState(emptyAutomaton('NFA'), { x: 0, y: 0 }), { x: 0, y: 200 })
    d = setEdgeSymbols(d, 'q0', 'q1', ['a'])
    d = setEdgeSymbols(d, 'q1', 'q1', ['b'])
    d = setEdgeSymbols(d, 'q0', 'q0', ['b'])
    const { edges } = toFlow(d)
    expect(edges.find((e) => e.id === 'q1→q1')!.data!.loopDown).toBe(true) // q0 is above q1
    expect(edges.find((e) => e.id === 'q0→q0')!.data!.loopDown).toBe(false) // q1 is below q0
  })

  it('keeps a loop on top when neighbours are level with it', () => {
    const { edges } = toFlow(example('dfa_even_ones'))
    expect(edges.find((e) => e.id === 'e→e')!.data!.loopDown).toBe(false)
  })

  it('bows a straight edge around a state that sits in its way', () => {
    let d = addState(addState(addState(emptyAutomaton('NFA'), { x: 0, y: 0 }), { x: 140, y: 6 }), {
      x: 280,
      y: 0,
    })
    d = setEdgeSymbols(d, 'q0', 'q2', ['a']) // q1 is exactly in the middle
    const { edges } = toFlow(d)
    expect(Math.abs(edges[0].data!.bow)).toBe(BIDIRECTIONAL_BOW)
  })

  it('leaves a clear straight edge straight', () => {
    expect(toFlow(example('dfa_ends_with_01')).edges.find((e) => e.id === 'q0→q1')!.data!.bow).toBe(
      0,
    )
  })
})

describe('toFlow: step-player views', () => {
  const nfa = () => {
    let d = addState(addState(addState(emptyAutomaton('NFA'), { x: 0, y: 0 }), { x: 140, y: 0 }), {
      x: 280,
      y: 0,
    })
    d = setEdgeSymbols(d, 'q0', 'q1', ['a', 'b']) // transitions 0 and 1
    d = setEdgeSymbols(d, 'q1', 'q2', ['a']) // transition 2
    return d
  }

  it('draws everything when nothing is marked as unbuilt', () => {
    const { nodes, edges } = toFlow(nfa())
    expect(nodes.every((n) => !n.data.ghost)).toBe(true)
    expect(edges).toHaveLength(2)
  })

  it('turns states that are not built yet into invisible ghosts instead of removing them', () => {
    const { nodes } = toFlow(nfa(), view({ builtStates: new Set(['q0', 'q1']) }))
    expect(nodes).toHaveLength(3) // still there, so the layout and fit do not jump around
    expect(nodes.map((n) => n.data.ghost)).toEqual([false, false, true])
  })

  it('omits edges whose every transition is unbuilt', () => {
    const { edges } = toFlow(nfa(), view({ builtTransitions: new Set([0, 1]) }))
    expect(edges.map((e) => e.id)).toEqual(['q0→q1'])
  })

  it('labels a half-built edge with only the symbols built so far', () => {
    const { edges } = toFlow(nfa(), view({ builtTransitions: new Set([0, 2]) }))
    expect(edges.find((e) => e.id === 'q0→q1')!.data!.label).toBe('a')
  })

  it('still lights an edge from the original transition indices', () => {
    const { edges } = toFlow(
      nfa(),
      view({ builtTransitions: new Set([1, 2]), activeTransitions: new Set([1]) }),
    )
    expect(edges.find((e) => e.id === 'q0→q1')!.data!.active).toBe(true)
  })

  it('does not curve an edge because of a reverse edge that is not built yet', () => {
    let d = addState(addState(emptyAutomaton('NFA'), { x: 0, y: 0 }), { x: 200, y: 0 })
    d = setEdgeSymbols(d, 'q0', 'q1', ['a']) // 0
    d = setEdgeSymbols(d, 'q1', 'q0', ['b']) // 1
    const half = toFlow(d, view({ builtTransitions: new Set([0]) }))
    expect(half.edges[0].data!.bow).toBe(0)
    expect(toFlow(d).edges.every((e) => e.data!.bow !== 0)).toBe(true)
  })

  it('assigns partition blocks to states', () => {
    const { nodes } = toFlow(
      nfa(),
      view({
        groups: new Map([
          ['q0', 0],
          ['q1', 1],
        ]),
      }),
    )
    expect(nodes.map((n) => n.data.group)).toEqual([0, 1, null])
  })

  it('marks edges read-only on a read-only view', () => {
    expect(toFlow(nfa()).edges.every((e) => !e.data!.readOnly)).toBe(true)
    expect(toFlow(nfa(), view({ readOnly: true })).edges.every((e) => e.data!.readOnly)).toBe(true)
  })
})

describe('stabilize', () => {
  const nfa = () =>
    setEdgeSymbols(
      addState(addState(emptyAutomaton('NFA'), { x: 0, y: 0 }), { x: 150, y: 0 }),
      'q0',
      'q1',
      ['a'],
    )

  it('hands back the previous objects when nothing changed', () => {
    const memory = new Map()
    const first = toFlow(nfa())
    const a = stabilize(first.nodes, memory)
    const again = stabilize(toFlow(nfa()).nodes, memory)
    expect(again[0]).toBe(a[0])
    expect(again[1]).toBe(a[1])
  })

  it('keeps unaffected elements identical while a selection changes only the selected one', () => {
    const nodeMemory = new Map()
    const edgeMemory = new Map()
    const before = toFlow(nfa())
    const n1 = stabilize(before.nodes, nodeMemory)
    const e1 = stabilize(before.edges, edgeMemory)

    const after = toFlow(nfa(), view({ selection: { kind: 'state', id: 'q1' } }))
    const n2 = stabilize(after.nodes, nodeMemory)
    const e2 = stabilize(after.edges, edgeMemory)

    expect(n2[0]).toBe(n1[0]) // q0 untouched
    expect(n2[1]).not.toBe(n1[1]) // q1 is now selected
    expect(n2[1].selected).toBe(true)
    expect(e2[0]).toBe(e1[0]) // the edge did not change at all
  })

  it('notices a moved state, a relabelled state and a highlighted edge', () => {
    const memory = new Map()
    const edgeMemory = new Map()
    const base = nfa()
    const first = toFlow(base)
    const n1 = stabilize(first.nodes, memory)
    const e1 = stabilize(first.edges, edgeMemory)

    const moved = {
      ...base,
      states: base.states.map((s) => (s.id === 'q0' ? { ...s, position: { x: 9, y: 9 } } : s)),
    }
    expect(stabilize(toFlow(moved).nodes, memory)[0]).not.toBe(n1[0])

    const relabelled = {
      ...base,
      states: base.states.map((s) => (s.id === 'q1' ? { ...s, label: 'X' } : s)),
    }
    expect(stabilize(toFlow(relabelled).nodes, memory)[1].data.label).toBe('X')

    const lit = toFlow(base, view({ activeTransitions: new Set([0]) }))
    expect(stabilize(lit.edges, edgeMemory)[0]).not.toBe(e1[0])
  })

  it('forgets elements that disappeared, so memory does not grow', () => {
    const memory = new Map()
    stabilize(toFlow(nfa()).nodes, memory)
    stabilize(toFlow(emptyAutomaton()).nodes, memory)
    expect(memory.size).toBe(0)
  })
})
