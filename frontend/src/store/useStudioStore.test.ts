import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Issue, SimulateResponse } from '../api/types'

vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  simulate: vi.fn(),
  simulateBatch: vi.fn(),
}))

import { ApiError, simulate, simulateBatch } from '../api/client'
import { useStudioStore } from './useStudioStore'

const store = () => useStudioStore.getState()
const at = { x: 0, y: 0 }

const trace = (n: number): SimulateResponse => ({
  accepted: true,
  stuck: false,
  steps: Array.from({ length: n }, (_, i) => ({
    index: i,
    title: `s${i}`,
    detail: '',
    states: ['q0'],
    transitions: [],
    position: i,
    symbol: null,
  })),
})

function draw() {
  store().newDoc()
  store().addStateAt(at)
  store().addStateAt(at)
  store().openPrompt('q0', 'q1')
  store().applyPrompt('a')
}

beforeEach(() => {
  vi.mocked(simulate).mockReset()
  vi.mocked(simulateBatch).mockReset()
  store().newDoc()
  store().setSimInput('')
})

describe('editing', () => {
  it('selects a newly added state', () => {
    store().addStateAt(at)
    expect(store().selection).toEqual({ kind: 'state', id: 'q0' })
  })

  it('applyPrompt writes the edge and selects it', () => {
    draw()
    expect(store().doc.transitions).toEqual([{ from: 'q0', to: 'q1', symbol: 'a' }])
    expect(store().selection).toEqual({ kind: 'edge', from: 'q0', to: 'q1' })
    expect(store().prompt).toBeNull()
  })

  it('applyPrompt keeps the prompt open and reports bad input', () => {
    store().addStateAt(at)
    store().openPrompt('q0', 'q0')
    expect(store().applyPrompt('ab')).toMatch(/single character/)
    expect(store().prompt).not.toBeNull()
    expect(store().doc.transitions).toEqual([])
  })

  it('clears the selection when the selected state is deleted', () => {
    draw()
    store().select({ kind: 'state', id: 'q1' })
    store().deleteState('q1')
    expect(store().selection).toBeNull()
  })

  it('clears an edge selection when its last transition goes', () => {
    draw()
    store().deleteEdge('q0', 'q1')
    expect(store().selection).toBeNull()
  })
})

describe('simulation', () => {
  it('stores the trace from the backend', async () => {
    draw()
    vi.mocked(simulate).mockResolvedValue(trace(3))
    store().setSimInput('aa')
    await store().runSimulation()
    expect(store().sim.trace?.steps).toHaveLength(3)
    expect(store().sim.step).toBe(0)
    expect(simulate).toHaveBeenCalledWith(store().doc, 'aa')
  })

  it('discards a finished trace when the automaton is edited', async () => {
    draw()
    vi.mocked(simulate).mockResolvedValue(trace(2))
    await store().runSimulation()
    store().toggleAccepting('q1')
    expect(store().sim.trace).toBeNull()
  })

  it('keeps the trace when a state is only dragged', async () => {
    draw()
    vi.mocked(simulate).mockResolvedValue(trace(2))
    await store().runSimulation()
    store().moveState('q0', { x: 50, y: 50 })
    expect(store().sim.trace).not.toBeNull()
  })

  it('ignores an answer that arrives after the automaton changed', async () => {
    draw()
    let resolve!: (t: SimulateResponse) => void
    vi.mocked(simulate).mockReturnValue(new Promise((r) => (resolve = r)))
    const running = store().runSimulation()
    store().toggleAccepting('q0')
    resolve(trace(2))
    await running
    expect(store().sim.trace).toBeNull()
  })

  it('turns an INVALID_AUTOMATON error into a readable message', async () => {
    draw()
    const issues: Issue[] = [
      {
        severity: 'error',
        code: 'NO_START',
        message: 'No start state is set.',
        stateIds: [],
        transitionIndices: [],
      },
    ]
    vi.mocked(simulate).mockRejectedValue(
      new ApiError('x', 400, { code: 'INVALID_AUTOMATON', issues }),
    )
    await store().runSimulation()
    expect(store().sim.error).toBe('Fix the automaton first: No start state is set.')
    expect(store().sim.running).toBe(false)
  })

  it('shows the backend message for a bad input symbol', async () => {
    draw()
    vi.mocked(simulate).mockRejectedValue(
      new ApiError("Input symbol 'x' at position 0 is not in the alphabet.", 400, {
        code: 'INPUT_SYMBOL',
        position: 0,
      }),
    )
    await store().runSimulation()
    expect(store().sim.error).toMatch(/Input symbol 'x'/)
  })

  it('clamps stepping to the trace and stops playing at the end', async () => {
    draw()
    vi.mocked(simulate).mockResolvedValue(trace(3))
    await store().runSimulation()
    store().gotoStep(-5)
    expect(store().sim.step).toBe(0)
    store().setPlaying(true)
    store().gotoStep(99)
    expect(store().sim.step).toBe(2)
    expect(store().sim.playing).toBe(false)
  })

  it('reset returns to step 0 and pauses', async () => {
    draw()
    vi.mocked(simulate).mockResolvedValue(trace(3))
    await store().runSimulation()
    store().gotoStep(2)
    store().resetSimulation()
    expect(store().sim).toMatchObject({ step: 0, playing: false })
  })
})

describe('batch', () => {
  it('sends one input per line, keeping blank lines but not a trailing newline', async () => {
    draw()
    vi.mocked(simulateBatch).mockResolvedValue({ results: [] })
    store().setBatchText('a\n\naa\n')
    await store().runBatch()
    expect(simulateBatch).toHaveBeenCalledWith(store().doc, ['a', '', 'aa'])
  })
})
