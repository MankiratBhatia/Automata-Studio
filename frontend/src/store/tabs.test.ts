import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Automaton, ConvertResponse } from '../api/types'

vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  regexToNfa: vi.fn(),
  removeEpsilon: vi.fn(),
  nfaToDfa: vi.fn(),
  minimizeDfa: vi.fn(),
}))

import { ApiError, minimizeDfa, nfaToDfa, regexToNfa, removeEpsilon } from '../api/client'
import { emptyAutomaton } from '../model/automaton'
import { loadWorkspace, saveWorkspace } from './persistence'
import { selectWorkspace, useStudioStore } from './useStudioStore'

const store = () => useStudioStore.getState()
const at = { x: 0, y: 0 }

function doc(name: string, states: string[], kind: Automaton['kind'] = 'DFA'): Automaton {
  return {
    ...emptyAutomaton(kind),
    name,
    states: states.map((id) => ({ id, label: id, position: at })),
    start: states[0] ?? null,
  }
}

const response = (a: Automaton, extra: Partial<ConvertResponse> = {}): ConvertResponse => ({
  automaton: a,
  steps: [],
  ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  // Reset to a single blank tab.
  const blank = { id: 'blank', doc: emptyAutomaton() }
  useStudioStore.setState({
    tabs: [blank],
    activeTabId: blank.id,
    doc: blank.doc,
    convert: { running: false, regexError: null, error: null, note: null },
  })
})

describe('tabs', () => {
  it('opening a result when the current tab is blank reuses it', () => {
    store().openInNewTab(doc('First', ['a']))
    expect(store().tabs).toHaveLength(1)
    expect(store().doc.name).toBe('First')
  })

  it('opening a result when the current tab has content adds and activates a tab', () => {
    store().openInNewTab(doc('First', ['a']))
    store().openInNewTab(doc('Second', ['x', 'y']))
    expect(store().tabs).toHaveLength(2)
    expect(store().doc.name).toBe('Second')
    expect(store().tabs.at(-1)?.id).toBe(store().activeTabId)
  })

  it('keeps edits made in a tab when you switch away and back', () => {
    store().openInNewTab(doc('First', ['a']))
    const first = store().activeTabId
    store().addStateAt(at) // edit the first tab: now has a, q0
    store().openInNewTab(doc('Second', ['x']))
    store().switchTab(first)
    expect(store().doc.states.map((s) => s.id)).toEqual(['a', 'q0'])
  })

  it('switching clears per-tab state such as selection and simulation', () => {
    store().openInNewTab(doc('First', ['a']))
    const first = store().activeTabId
    store().openInNewTab(doc('Second', ['x']))
    store().select({ kind: 'state', id: 'x' })
    store().switchTab(first)
    expect(store().selection).toBeNull()
    expect(store().sim.trace).toBeNull()
  })

  it('closing the active tab activates its neighbour', () => {
    store().openInNewTab(doc('A', ['a']))
    store().openInNewTab(doc('B', ['b']))
    store().openInNewTab(doc('C', ['c']))
    const [a, b, c] = store().tabs.map((t) => t.id)
    store().switchTab(b)
    store().closeTab(b)
    expect(store().tabs.map((t) => t.id)).toEqual([a, c])
    expect(store().activeTabId).toBe(c)
    expect(store().doc.name).toBe('C')
  })

  it('closing a background tab leaves the active one alone', () => {
    store().openInNewTab(doc('A', ['a']))
    const a = store().activeTabId
    store().openInNewTab(doc('B', ['b']))
    store().closeTab(a)
    expect(store().doc.name).toBe('B')
    expect(store().tabs).toHaveLength(1)
  })

  it('closing the last tab leaves one blank tab', () => {
    store().openInNewTab(doc('A', ['a']))
    store().closeTab(store().activeTabId)
    expect(store().tabs).toHaveLength(1)
    expect(store().doc.states).toEqual([])
  })

  it('newTab does nothing on a blank tab but adds one otherwise', () => {
    store().newTab()
    expect(store().tabs).toHaveLength(1)
    store().openInNewTab(doc('A', ['a']))
    store().newTab()
    expect(store().tabs).toHaveLength(2)
    expect(store().doc.states).toEqual([])
  })

  it('selectWorkspace includes unsaved edits of the active tab', () => {
    store().openInNewTab(doc('A', ['a']))
    store().addStateAt(at)
    const active = selectWorkspace(store()).tabs.find((t) => t.id === store().activeTabId)
    expect(active?.doc.states).toHaveLength(2)
  })
})

describe('workspace persistence', () => {
  it('round-trips every tab and the active one', () => {
    store().openInNewTab(doc('A', ['a']))
    store().openInNewTab(doc('B', ['b']))
    saveWorkspace(selectWorkspace(store()))
    const loaded = loadWorkspace()
    expect(loaded?.tabs.map((t) => t.doc.name)).toEqual(['A', 'B'])
    expect(loaded?.activeId).toBe(store().activeTabId)
  })

  it('migrates the single-document save from Phase 2', () => {
    localStorage.setItem('automata-studio:doc:v1', JSON.stringify(doc('Old', ['q0'])))
    const loaded = loadWorkspace()
    expect(loaded?.tabs).toHaveLength(1)
    expect(loaded?.tabs[0].doc.name).toBe('Old')
  })

  it('ignores corrupt saved data instead of crashing', () => {
    localStorage.setItem('automata-studio:workspace:v1', '{not json')
    expect(loadWorkspace()).toBeNull()
    localStorage.setItem(
      'automata-studio:workspace:v1',
      JSON.stringify({ tabs: [{ id: 'x', doc: {} }] }),
    )
    expect(loadWorkspace()).toBeNull()
  })

  it('falls back to the first tab when the saved active id is unknown', () => {
    localStorage.setItem(
      'automata-studio:workspace:v1',
      JSON.stringify({ activeId: 'gone', tabs: [{ id: 'one', doc: doc('A', ['a']) }] }),
    )
    expect(loadWorkspace()?.activeId).toBe('one')
  })
})

describe('conversions', () => {
  it('opens the result in a new tab and summarises it', async () => {
    store().openInNewTab(doc('NFA', ['p', 'q', 'r'], 'NFA'))
    vi.mocked(nfaToDfa).mockResolvedValue(response(doc('NFA (DFA)', ['{p}', '{p,q}'])))
    expect(await store().runConversion('nfa-to-dfa')).toBe(true)
    expect(store().doc.name).toBe('NFA (DFA)')
    expect(store().tabs).toHaveLength(2)
    expect(store().convert.note).toBe('3 NFA states → 2 DFA states.')
    expect(nfaToDfa).toHaveBeenCalledWith(expect.objectContaining({ name: 'NFA' }))
  })

  it('reports which states minimisation merged', async () => {
    store().openInNewTab(doc('D', ['A', 'B', 'C', 'D']))
    vi.mocked(minimizeDfa).mockResolvedValue(
      response(doc('D (minimal)', ['A', 'B=C', 'D']), {
        stateMap: { A: ['A'], 'B=C': ['B', 'C'], D: ['D'] },
      }),
    )
    await store().runConversion('minimize')
    expect(store().convert.note).toBe('4 states → 3 states. Merged: B + C.')
  })

  it('says so when nothing could be merged', async () => {
    store().openInNewTab(doc('D', ['A', 'B']))
    vi.mocked(minimizeDfa).mockResolvedValue(
      response(doc('D', ['A', 'B']), { stateMap: { A: ['A'], B: ['B'] } }),
    )
    await store().runConversion('minimize')
    expect(store().convert.note).toMatch(/Already minimal/)
  })

  it('uses the right endpoint for ε-removal', async () => {
    store().openInNewTab(doc('E', ['a', 'b'], 'ENFA'))
    vi.mocked(removeEpsilon).mockResolvedValue(response(doc('E', ['a'], 'NFA')))
    await store().runConversion('remove-epsilon')
    expect(removeEpsilon).toHaveBeenCalled()
    expect(store().convert.note).toBe('2 states → 1 state, no ε-transitions.')
  })

  it('shows a readable error and opens no tab when the backend refuses', async () => {
    store().openInNewTab(doc('N', ['a'], 'NFA'))
    vi.mocked(nfaToDfa).mockRejectedValue(
      new ApiError('The result would have more than 512 states.', 400, { code: 'LIMIT_EXCEEDED' }),
    )
    expect(await store().runConversion('nfa-to-dfa')).toBe(false)
    expect(store().convert.error).toMatch(/more than 512/)
    expect(store().convert.running).toBe(false)
    expect(store().tabs).toHaveLength(1)
  })

  it('a successful run clears an earlier error', async () => {
    store().openInNewTab(doc('N', ['a'], 'NFA'))
    vi.mocked(nfaToDfa).mockRejectedValueOnce(new ApiError('boom', 400))
    await store().runConversion('nfa-to-dfa')
    vi.mocked(nfaToDfa).mockResolvedValue(response(doc('N (DFA)', ['{a}'])))
    await store().runConversion('nfa-to-dfa')
    expect(store().convert.error).toBeNull()
  })
})

describe('regex', () => {
  it('builds an ε-NFA into a tab', async () => {
    vi.mocked(regexToNfa).mockResolvedValue(
      response(doc('Thompson: ab', ['q0', 'q1', 'q2', 'q3', 'q4'], 'ENFA')),
    )
    expect(await store().buildFromRegex('ab')).toBe(true)
    expect(store().doc.kind).toBe('ENFA')
    expect(store().convert.note).toBe('Built an ε-NFA with 5 states.')
  })

  it('keeps the syntax error position and the pattern for the caret', async () => {
    vi.mocked(regexToNfa).mockRejectedValue(
      new ApiError('Missing ) to close this (.', 400, { code: 'REGEX_SYNTAX', position: 0 }),
    )
    expect(await store().buildFromRegex('(a')).toBe(false)
    expect(store().convert.regexError).toEqual({
      message: 'Missing ) to close this (.',
      position: 0,
      pattern: '(a',
    })
    expect(store().convert.error).toBeNull()
  })

  it('the pipeline opens three tabs in order and ends on the minimal DFA', async () => {
    const enfa = doc('Thompson: a', ['q0', 'q1'], 'ENFA')
    const dfa = doc('Thompson: a (DFA)', ['{q0}', '{q1}', '∅'])
    const min = doc('Thompson: a (DFA) (minimal)', ['{q0}', '{q1}', '∅'])
    vi.mocked(regexToNfa).mockResolvedValue(response(enfa))
    vi.mocked(nfaToDfa).mockResolvedValue(response(dfa))
    vi.mocked(minimizeDfa).mockResolvedValue(response(min))
    expect(await store().runPipeline('a')).toBe(true)
    expect(selectWorkspace(store()).tabs.map((t) => t.doc.name)).toEqual([
      'Thompson: a',
      'Thompson: a (DFA)',
      'Thompson: a (DFA) (minimal)',
    ])
    expect(store().doc.name).toBe('Thompson: a (DFA) (minimal)')
    expect(store().convert.note).toBe('ε-NFA (2 states) → DFA (3) → minimal DFA (3).')
    // Each stage is fed the previous stage's output.
    expect(nfaToDfa).toHaveBeenCalledWith(enfa)
    const sentToMinimise = vi.mocked(minimizeDfa).mock.calls[0][0]
    expect(sentToMinimise.states.map((s) => s.id)).toEqual(['{q0}', '{q1}', '∅'])
    expect(sentToMinimise.states.map((s) => s.label)).toEqual(['A', 'B', '∅']) // labels carry through
  })

  it('a bad regex in the pipeline stops before any later stage', async () => {
    vi.mocked(regexToNfa).mockRejectedValue(
      new ApiError('empty', 400, { code: 'REGEX_SYNTAX', position: 0 }),
    )
    expect(await store().runPipeline('')).toBe(false)
    expect(nfaToDfa).not.toHaveBeenCalled()
    expect(store().convert.regexError).not.toBeNull()
  })
})
