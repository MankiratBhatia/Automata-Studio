import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Automaton,
  ConvertResponse,
  EquivalenceResponse,
  SimulateResponse,
  Step,
} from '../api/types'

vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  regexToNfa: vi.fn(),
  nfaToDfa: vi.fn(),
  minimizeDfa: vi.fn(),
  removeEpsilon: vi.fn(),
  checkEquivalence: vi.fn(),
  simulate: vi.fn(),
}))

import {
  ApiError,
  checkEquivalence,
  minimizeDfa,
  nfaToDfa,
  regexToNfa,
  simulate,
} from '../api/client'
import { emptyAutomaton } from '../model/automaton'
import { docOfTab, useStudioStore } from './useStudioStore'

const store = () => useStudioStore.getState()
const at = { x: 0, y: 0 }

function doc(
  name: string,
  states: string[],
  kind: Automaton['kind'] = 'DFA',
  alphabet: string[] = [],
): Automaton {
  return {
    ...emptyAutomaton(kind),
    name,
    alphabet,
    states: states.map((id) => ({ id, label: id, position: at })),
    start: states[0] ?? null,
  }
}

const step = (index: number, extra: Partial<Step> = {}): Step => ({
  index,
  title: `s${index}`,
  detail: '',
  states: [],
  transitions: [],
  addsStates: [],
  addsTransitions: [],
  round: null,
  ...extra,
})

const response = (a: Automaton, extra: Partial<ConvertResponse> = {}): ConvertResponse => ({
  automaton: a,
  steps: [step(0), step(1), step(2)],
  ...extra,
})

const trace = (n: number, accepted = true): SimulateResponse => ({
  accepted,
  stuck: false,
  steps: Array.from({ length: n }, (_, i) => ({
    index: i,
    title: '',
    detail: '',
    states: [],
    transitions: [],
    position: i,
    symbol: null,
  })),
})

const verdict = (over: Partial<EquivalenceResponse>): EquivalenceResponse => ({
  equivalent: false,
  counterexample: '00',
  aAccepts: true,
  bAccepts: false,
  explored: 4,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  const blank = { id: 'blank', doc: emptyAutomaton() }
  useStudioStore.setState({
    tabs: [blank],
    activeTabId: blank.id,
    doc: blank.doc,
    records: {},
    player: { index: 0, playing: false },
    sideTab: 'edit',
    convert: { running: false, regexError: null, error: null, note: null },
    compare: {
      aId: null,
      bId: null,
      running: false,
      error: null,
      result: null,
      checked: null,
      sideBySide: false,
      traces: null,
      step: 0,
      playing: false,
    },
  })
})

describe('conversion records for the step player', () => {
  it('a conversion records how its tab came to be', async () => {
    store().openInNewTab(doc('NFA', ['p', 'q'], 'NFA'))
    const source = store().doc
    vi.mocked(nfaToDfa).mockResolvedValue(
      response(doc('NFA (DFA)', ['{p}', '{p,q}']), { stateMap: { '{p}': ['p'] } }),
    )
    await store().runConversion('nfa-to-dfa')
    const record = store().records[store().activeTabId]
    expect(record.op).toBe('nfa-to-dfa')
    expect(record.source).toBe(source)
    expect(record.result.name).toBe('NFA (DFA)')
    expect(record.result.states.map((s) => s.label)).toEqual(['A', 'B']) // the lettered result
    expect(record.steps).toHaveLength(3)
    expect(record.stateMap).toEqual({ '{p}': ['p'] })
    expect(record.rounds).toBeNull()
  })

  it('a regex has no source automaton', async () => {
    vi.mocked(regexToNfa).mockResolvedValue(response(doc('Thompson: a', ['q0', 'q1'], 'ENFA')))
    await store().buildFromRegex('a')
    expect(store().records[store().activeTabId]).toMatchObject({ op: 'regex', source: null })
  })

  it('keeps minimisation rounds', async () => {
    store().openInNewTab(doc('D', ['a', 'b']))
    vi.mocked(minimizeDfa).mockResolvedValue(
      response(doc('D (minimal)', ['a']), { rounds: [[['a', 'b']]] }),
    )
    await store().runConversion('minimize')
    expect(store().records[store().activeTabId].rounds).toEqual([[['a', 'b']]])
  })

  it('each pipeline stage gets its own record, fed by the stage before', async () => {
    const enfa = doc('T', ['q0', 'q1'], 'ENFA')
    const dfa = doc('T (DFA)', ['{q0}', '{q1}'])
    const min = doc('T (min)', ['{q0}'])
    vi.mocked(regexToNfa).mockResolvedValue(response(enfa))
    vi.mocked(nfaToDfa).mockResolvedValue(response(dfa))
    vi.mocked(minimizeDfa).mockResolvedValue(response(min))
    await store().runPipeline('a')
    const byName = Object.fromEntries(
      store()
        .tabs.map((t) => [t.doc.name, store().records[t.id]])
        .filter(([, r]) => r),
    )
    expect(byName['T'].op).toBe('regex')
    expect(byName['T (DFA)'].op).toBe('nfa-to-dfa')
    expect(byName['T (DFA)'].source?.name).toBe('T') // the ε-NFA tab
    expect(byName['T (min)'].source?.name).toBe('T (DFA)') // the DFA tab
  })

  it('records belong to their tab: another tab has none', async () => {
    vi.mocked(regexToNfa).mockResolvedValue(response(doc('T', ['q0'], 'ENFA')))
    await store().buildFromRegex('a')
    const withRecord = store().activeTabId
    store().newTab()
    expect(store().records[store().activeTabId]).toBeUndefined()
    store().switchTab(withRecord)
    expect(store().records[store().activeTabId]).toBeDefined()
  })

  it('closing a tab discards its record', async () => {
    vi.mocked(regexToNfa).mockResolvedValue(response(doc('T', ['q0'], 'ENFA')))
    await store().buildFromRegex('a')
    const id = store().activeTabId
    store().openInNewTab(doc('Other', ['x']))
    store().closeTab(id)
    expect(store().records[id]).toBeUndefined()
  })

  it('failed conversions leave no record', async () => {
    store().openInNewTab(doc('N', ['a'], 'NFA'))
    vi.mocked(nfaToDfa).mockRejectedValue(new ApiError('nope', 400))
    await store().runConversion('nfa-to-dfa')
    expect(store().records).toEqual({})
  })
})

describe('player', () => {
  async function withRecord() {
    vi.mocked(regexToNfa).mockResolvedValue(response(doc('T', ['q0'], 'ENFA')))
    await store().buildFromRegex('a') // 3 steps: indices 0..2
  }

  it('starts at the first step', async () => {
    await withRecord()
    expect(store().player).toEqual({ index: 0, playing: false })
  })

  it('clamps stepping to the recorded steps', async () => {
    await withRecord()
    store().gotoPlayerStep(-3)
    expect(store().player.index).toBe(0)
    store().gotoPlayerStep(99)
    expect(store().player.index).toBe(2)
  })

  it('stops playing at the last step', async () => {
    await withRecord()
    store().setPlayerPlaying(true)
    store().gotoPlayerStep(1)
    expect(store().player.playing).toBe(true)
    store().gotoPlayerStep(2)
    expect(store().player.playing).toBe(false)
  })

  it('goes back to step 0 when you switch tabs', async () => {
    await withRecord()
    const id = store().activeTabId
    store().gotoPlayerStep(2)
    store().newTab()
    store().switchTab(id)
    expect(store().player.index).toBe(0)
  })
})

describe('equivalence', () => {
  function twoTabs() {
    store().openInNewTab(doc('A', ['a'], 'DFA', ['0']))
    const a = store().activeTabId
    store().openInNewTab(doc('B', ['b'], 'DFA', ['0']))
    return { a, b: store().activeTabId }
  }

  it('sends both automata and keeps the result with the automata it was for', async () => {
    const { a, b } = twoTabs()
    vi.mocked(checkEquivalence).mockResolvedValue(verdict({}))
    await store().runEquivalence(a, b)
    const { result, checked, running } = store().compare
    expect(result?.counterexample).toBe('00')
    expect(checked?.a.name).toBe('A')
    expect(checked?.b.name).toBe('B')
    expect(running).toBe(false)
    expect(vi.mocked(checkEquivalence).mock.calls[0].map((d) => d.name)).toEqual(['A', 'B'])
  })

  it('the active tab is compared as it is on screen, edits included', async () => {
    const { a, b } = twoTabs()
    vi.mocked(checkEquivalence).mockResolvedValue(verdict({}))
    store().addStateAt(at) // unsaved edit to B (the active tab)
    await store().runEquivalence(a, b)
    expect(vi.mocked(checkEquivalence).mock.calls[0][1].states).toHaveLength(2)
    expect(docOfTab(store(), b)).toBe(store().doc)
  })

  it('shows a backend error', async () => {
    const { a, b } = twoTabs()
    vi.mocked(checkEquivalence).mockRejectedValue(
      new ApiError('too big', 400, { code: 'LIMIT_EXCEEDED' }),
    )
    await store().runEquivalence(a, b)
    expect(store().compare.error).toBe('too big')
    expect(store().compare.result).toBeNull()
  })

  it('picking different tabs clears the old result', async () => {
    const { a, b } = twoTabs()
    vi.mocked(checkEquivalence).mockResolvedValue(verdict({}))
    await store().runEquivalence(a, b)
    store().setCompareTabs(b, a)
    expect(store().compare.result).toBeNull()
  })

  it('closing a compared tab resets the comparison', async () => {
    const { a, b } = twoTabs()
    vi.mocked(checkEquivalence).mockResolvedValue(verdict({}))
    await store().runEquivalence(a, b)
    store().closeTab(a)
    expect(store().compare).toMatchObject({ aId: null, result: null })
  })
})

describe('side by side', () => {
  async function checked(a: Automaton, b: Automaton, v: Partial<EquivalenceResponse> = {}) {
    store().openInNewTab(a)
    const aId = store().activeTabId
    store().openInNewTab(b)
    vi.mocked(checkEquivalence).mockResolvedValue(verdict(v))
    await store().runEquivalence(aId, store().activeTabId)
  }

  it('runs the counterexample on both automata', async () => {
    await checked(doc('A', ['a'], 'DFA', ['0']), doc('B', ['b'], 'DFA', ['0']))
    vi.mocked(simulate).mockResolvedValueOnce(trace(3, true)).mockResolvedValueOnce(trace(3, false))
    await store().openSideBySide()
    const c = store().compare
    expect(c.sideBySide).toBe(true)
    expect(vi.mocked(simulate).mock.calls.map((x) => [x[0].name, x[1]])).toEqual([
      ['A', '00'],
      ['B', '00'],
    ])
    expect('trace' in c.traces!.a && c.traces!.a.trace.accepted).toBe(true)
    expect('trace' in c.traces!.b && c.traces!.b.trace.accepted).toBe(false)
  })

  it('works for the empty-string counterexample', async () => {
    await checked(doc('A', ['a'], 'DFA', ['0']), doc('B', ['b'], 'DFA', ['0']), {
      counterexample: '',
    })
    vi.mocked(simulate).mockResolvedValue(trace(1))
    await store().openSideBySide()
    expect(store().compare.sideBySide).toBe(true)
    expect(vi.mocked(simulate).mock.calls[0][1]).toBe('')
  })

  it('does not ask the backend to run a symbol an automaton has never heard of', async () => {
    await checked(doc('A', ['a'], 'DFA', ['a']), doc('B', ['b'], 'DFA', ['a', 'b']), {
      counterexample: 'b',
      aAccepts: false,
      bAccepts: true,
    })
    vi.mocked(simulate).mockResolvedValue(trace(2, true))
    await store().openSideBySide()
    const { a, b } = store().compare.traces!
    expect(a).toEqual({ note: expect.stringContaining('“b” is not in this automaton’s alphabet') })
    expect('trace' in b).toBe(true)
    expect(simulate).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the automata are equivalent', async () => {
    await checked(doc('A', ['a']), doc('B', ['b']), { equivalent: true, counterexample: null })
    await store().openSideBySide()
    expect(store().compare.sideBySide).toBe(false)
  })

  it('steps through the longer of the two runs', async () => {
    await checked(doc('A', ['a'], 'DFA', ['0']), doc('B', ['b'], 'DFA', ['0']))
    vi.mocked(simulate).mockResolvedValueOnce(trace(2)).mockResolvedValueOnce(trace(4))
    await store().openSideBySide()
    store().gotoCompareStep(99)
    expect(store().compare.step).toBe(3)
    store().gotoCompareStep(-1)
    expect(store().compare.step).toBe(0)
  })

  it('stops playing at the end and can be closed', async () => {
    await checked(doc('A', ['a'], 'DFA', ['0']), doc('B', ['b'], 'DFA', ['0']))
    vi.mocked(simulate).mockResolvedValue(trace(3))
    await store().openSideBySide()
    store().setComparePlaying(true)
    store().gotoCompareStep(2)
    expect(store().compare.playing).toBe(false)
    store().closeSideBySide()
    expect(store().compare.sideBySide).toBe(false)
  })
})
