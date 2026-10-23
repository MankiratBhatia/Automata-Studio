import { describe, expect, it } from 'vitest'
import { PDA_EXAMPLES, TM_EXAMPLES } from '../machines/examples'
import {
  addPdaTransition,
  addState,
  addTmTransition,
  emptyPda,
  emptyTm,
  fromPdaRow,
  pdaDiagram,
  pdaLabel,
  pdaRow,
  removeState,
  removeTransition,
  renameState,
  setAccepting,
  setStart,
  tmDiagram,
  tmLabel,
  toggleAccepting,
  toggleRejecting,
  updatePdaTransition,
  updateTmTransition,
  type Pda,
  type Tm,
} from './machines'

const pda = (id: string) => PDA_EXAMPLES.find((e) => e.id === id)!.machine
const tm = (id: string) => TM_EXAMPLES.find((e) => e.id === id)!.machine

describe('states', () => {
  it('numbers new states from q0 and makes the first one the start', () => {
    const m = addState(addState(emptyPda()))
    expect(m.states.map((s) => s.id)).toEqual(['q0', 'q1'])
    expect(m.start).toBe('q0')
  })

  it('reuses the smallest free name', () => {
    let m = addState(addState(addState(emptyTm())))
    m = removeState(m, 'q1')
    expect(addState(m).states.map((s) => s.id)).toEqual(['q0', 'q2', 'q1'])
  })

  it('removing a state removes its moves, its flags and the start', () => {
    const m = removeState(pda('pda_anbn_final'), 'q0')
    expect(m.start).toBeNull()
    expect(m.states.map((s) => s.id)).toEqual(['q1', 'q2'])
    expect(m.transitions.every((t) => t.from !== 'q0' && t.to !== 'q0')).toBe(true)
    expect(removeState(pda('pda_anbn_final'), 'q2').accepting).toEqual([])
  })

  it('a Turing machine also forgets a removed rejecting state', () => {
    const base = { ...tm('tm_increment'), rejecting: ['done'] }
    expect(removeState(base, 'done').rejecting).toEqual([])
  })

  it('renaming updates every mention of the state', () => {
    const r = renameState(pda('pda_anbn_final'), 'q0', 'start')
    if ('error' in r) throw new Error(r.error)
    const m = r.machine
    expect(m.start).toBe('start')
    expect(m.states[0]).toEqual({ id: 'start', label: 'start' })
    expect(
      m.transitions.filter((t) => t.from === 'start' || t.to === 'start').length,
    ).toBeGreaterThan(0)
    expect(m.transitions.some((t) => t.from === 'q0' || t.to === 'q0')).toBe(false)
  })

  it('renaming a rejecting state of a Turing machine keeps it rejecting', () => {
    const base: Tm = { ...tm('tm_increment'), rejecting: ['carry'] }
    const r = renameState(base, 'carry', 'overflow')
    if ('error' in r) throw new Error(r.error)
    expect(r.machine.rejecting).toEqual(['overflow'])
  })

  it('refuses a clashing or empty name, and allows keeping the same name', () => {
    expect(renameState(pda('pda_anbn_final'), 'q0', 'q1')).toEqual({
      error: 'Another state is already called “q1”.',
    })
    expect(renameState(pda('pda_anbn_final'), 'q0', '  ')).toEqual({
      error: 'A state needs a name.',
    })
    expect('machine' in renameState(pda('pda_anbn_final'), 'q0', 'q0')).toBe(true)
  })

  it('start and accepting toggles', () => {
    const m = addState(emptyPda())
    expect(setStart(m, null).start).toBeNull()
    expect(toggleAccepting(m, 'q0').accepting).toEqual(['q0'])
    expect(toggleAccepting(toggleAccepting(m, 'q0'), 'q0').accepting).toEqual([])
  })

  it('a state cannot accept and reject at once: setting one clears the other', () => {
    let m = addState(emptyTm())
    m = setAccepting(m, 'q0')
    expect(m.accepting).toEqual(['q0'])
    m = toggleRejecting(m, 'q0')
    expect(m.rejecting).toEqual(['q0'])
    expect(m.accepting).toEqual([])
    m = setAccepting(m, 'q0')
    expect(m.rejecting).toEqual([])
    expect(m.accepting).toEqual(['q0'])
  })

  it('never mutates its input', () => {
    const m = pda('pda_balanced')
    const before = JSON.stringify(m)
    addState(m)
    removeState(m, 'q0')
    renameState(m, 'q0', 'z')
    toggleAccepting(m, 'q0')
    expect(JSON.stringify(m)).toBe(before)
  })
})

describe('PDA transition rows', () => {
  it('shows nothing as an empty cell and reads ε or blank as "nothing"', () => {
    const t = { from: 'a', to: 'b', input: null, pop: null, push: '' }
    expect(pdaRow(t)).toEqual({ from: 'a', to: 'b', input: '', pop: '', push: '' })
    expect(fromPdaRow({ from: 'a', to: 'b', input: 'ε', pop: ' ', push: 'ε' })).toEqual(t)
  })

  it('keeps real symbols and strips stray spaces', () => {
    expect(fromPdaRow({ from: 'a', to: 'b', input: ' x ', pop: 'Z', push: ' AZ ' })).toEqual({
      from: 'a',
      to: 'b',
      input: 'x',
      pop: 'Z',
      push: 'AZ',
    })
  })

  it('round-trips every example transition', () => {
    for (const e of PDA_EXAMPLES) {
      for (const t of e.machine.transitions) expect(fromPdaRow(pdaRow(t))).toEqual(t)
    }
  })

  it('adds, edits and removes transitions', () => {
    let m: Pda = addState(emptyPda())
    m = addPdaTransition(m)
    expect(m.transitions).toEqual([{ from: 'q0', to: 'q0', input: null, pop: null, push: '' }])
    m = updatePdaTransition(m, 0, { ...m.transitions[0], input: 'a' })
    expect(m.transitions[0].input).toBe('a')
    expect(removeTransition(m, 0).transitions).toEqual([])
  })

  it('a new Turing machine move starts as "copy the symbol and move right"', () => {
    let m: Tm = addState(emptyTm())
    m = addTmTransition(m)
    expect(m.transitions).toEqual([{ from: 'q0', to: 'q0', read: '_', write: '_', move: 'R' }])
    m = updateTmTransition(m, 0, { ...m.transitions[0], move: 'L' })
    expect(m.transitions[0].move).toBe('L')
  })

  it('a transition added to an empty machine has no state to point at yet', () => {
    expect(addPdaTransition(emptyPda()).transitions[0].from).toBe('')
  })
})

describe('drawing a machine', () => {
  it('labels PDA moves read,pop/push with ε for nothing', () => {
    expect(pdaLabel({ from: 'a', to: 'b', input: 'a', pop: 'Z', push: 'AZ' })).toBe('a,Z/AZ')
    expect(pdaLabel({ from: 'a', to: 'b', input: null, pop: 'A', push: '' })).toBe('ε,A/ε')
  })

  it('labels Turing machine moves read/write,move', () => {
    expect(tmLabel({ from: 'a', to: 'b', read: '0', write: '1', move: 'R' })).toBe('0/1,R')
  })

  it('merges moves between the same two states into one multi-line label', () => {
    const d = pdaDiagram(pda('pda_anbn_final'))
    const loop = d.doc.transitions.find((t) => t.from === 'q0' && t.to === 'q0')!
    expect(loop.symbol).toBe('a,Z/AZ\na,A/AA')
  })

  it('maps every machine transition to the edge that carries it', () => {
    const m = pda('pda_anbn_final')
    const d = pdaDiagram(m)
    expect(d.edgeOf).toHaveLength(m.transitions.length)
    m.transitions.forEach((t, i) => {
      const edge = d.doc.transitions[d.edgeOf[i]]
      expect([edge.from, edge.to]).toEqual([t.from, t.to])
      expect(edge.symbol).toContain(pdaLabel(t))
    })
  })

  it('keeps the start state and accepting states', () => {
    const d = pdaDiagram(pda('pda_anbn_final'))
    expect(d.doc.start).toBe('q0')
    expect(d.doc.accepting).toEqual(['q2'])
  })

  it('marks rejecting Turing machine states', () => {
    const m: Tm = { ...tm('tm_increment'), rejecting: ['carry'] }
    expect(tmDiagram(m).doc.states.find((s) => s.id === 'carry')!.label).toBe('carry ✗')
    expect(tmDiagram(m).doc.accepting).toEqual(['done'])
  })

  it('skips moves that point at missing states instead of breaking the picture', () => {
    const m: Pda = {
      ...pda('pda_balanced'),
      transitions: [
        { from: 'q0', to: 'ghost', input: 'a', pop: null, push: '' },
        { from: 'q0', to: 'q1', input: null, pop: null, push: '' },
      ],
    }
    const d = pdaDiagram(m)
    expect(d.doc.transitions).toHaveLength(1)
    expect(d.edgeOf).toEqual([-1, 0]) // the broken move has no edge
  })

  it('draws every example without losing a single move', () => {
    for (const e of PDA_EXAMPLES) {
      expect(pdaDiagram(e.machine).edgeOf.every((i) => i >= 0)).toBe(true)
    }
    for (const e of TM_EXAMPLES) {
      expect(tmDiagram(e.machine).edgeOf.every((i) => i >= 0)).toBe(true)
    }
  })

  it('an empty machine is an empty diagram', () => {
    expect(pdaDiagram(emptyPda()).doc.states).toEqual([])
  })
})

describe('the example gallery', () => {
  it('has the four PDAs and three halting Turing machines plus the loop demo', () => {
    expect(PDA_EXAMPLES.map((e) => e.id)).toEqual([
      'pda_anbn_empty',
      'pda_anbn_final',
      'pda_balanced',
      'pda_palindromes',
    ])
    expect(TM_EXAMPLES.map((e) => e.id)).toEqual([
      'tm_anbncn',
      'tm_increment',
      'tm_loop_forever',
      'tm_palindromes',
    ])
  })

  it('does not pick up the expectations file', () => {
    expect([...PDA_EXAMPLES, ...TM_EXAMPLES].some((e) => e.id.includes('expectations'))).toBe(false)
  })
})
