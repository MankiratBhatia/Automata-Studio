import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PdaRunResponse, TmRunResponse } from '../api/types'

vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  runPda: vi.fn(),
  runTm: vi.fn(),
  validatePda: vi.fn(),
  validateTm: vi.fn(),
}))

import { ApiError, runPda, runTm, validatePda, validateTm } from '../api/client'
import { PDA_EXAMPLES, TM_EXAMPLES } from './examples'
import { saveMachines } from './persistence'
import { useMachineStore, validateMachine } from './useMachineStore'

const store = () => useMachineStore.getState()
const pdaExample = PDA_EXAMPLES.find((e) => e.id === 'pda_balanced')!.machine
const tmExample = TM_EXAMPLES.find((e) => e.id === 'tm_palindromes')!.machine

const pdaResult = (n: number): PdaRunResponse => ({
  verdict: 'accepted',
  closest: false,
  explored: n,
  reason: '',
  steps: Array.from({ length: n }, (_, i) => ({
    index: i,
    state: 'q0',
    position: i,
    stack: 'Z',
    transition: i === 0 ? null : 0,
    note: '',
  })),
})
const tmResult = (n: number): TmRunResponse => ({
  status: 'accepted',
  reason: 'done',
  output: '1',
  steps: Array.from({ length: n }, (_, i) => ({
    index: i,
    state: 'q0',
    head: i,
    transition: i === 0 ? null : 0,
    read: null,
    write: null,
    cell: null,
    note: '',
  })),
})

beforeEach(() => {
  vi.clearAllMocks()
  useMachineStore.setState({ pda: pdaExample, tm: tmExample })
  store().setInput('pda', '')
  store().setInput('tm', '')
})

describe('first start', () => {
  it('begins with a working example in each mode rather than a blank screen', async () => {
    localStorage.clear()
    vi.resetModules()
    const fresh = (await import('./useMachineStore')).useMachineStore.getState()
    expect(fresh.pda.name).toBe('a^n b^n (accept by final state)')
    expect(fresh.tm.name).toBe('Binary increment')
  })

  it('restores what was saved', async () => {
    saveMachines({ pda: pdaExample, tm: tmExample })
    vi.resetModules()
    const fresh = (await import('./useMachineStore')).useMachineStore.getState()
    expect(fresh.pda.name).toBe(pdaExample.name)
    expect(fresh.tm.name).toBe(tmExample.name)
    localStorage.clear()
  })

  it('ignores damaged saved data and falls back to the examples', async () => {
    localStorage.setItem(
      'automata-studio:machines:v1',
      JSON.stringify({ pda: { nonsense: true }, tm: 5 }),
    )
    vi.resetModules()
    const fresh = (await import('./useMachineStore')).useMachineStore.getState()
    expect(fresh.pda.name).toBe('a^n b^n (accept by final state)')
    localStorage.clear()
  })
})

describe('editing', () => {
  it('an edit applies and discards a finished run', async () => {
    store().setInput('pda', '()')
    vi.mocked(runPda).mockResolvedValue(pdaResult(3))
    await store().run('pda')
    expect(store().pdaRun.result).not.toBeNull()
    store().editPda((p) => ({ ...p, name: 'Renamed' }))
    expect(store().pda.name).toBe('Renamed')
    expect(store().pdaRun.result).toBeNull()
    expect(store().pdaRun.input).toBe('()') // what you typed is kept
  })

  it('does the same for a Turing machine', async () => {
    vi.mocked(runTm).mockResolvedValue(tmResult(2))
    await store().run('tm')
    store().editTm((t) => ({ ...t, name: 'X' }))
    expect(store().tmRun.result).toBeNull()
  })

  it('loading a machine replaces it and clears the run and the input', () => {
    store().setInput('tm', 'abba')
    store().loadTm(TM_EXAMPLES[0].machine)
    expect(store().tm.name).toBe(TM_EXAMPLES[0].machine.name)
    expect(store().tmRun.input).toBe('')
  })

  it('the chosen speed survives edits and loads', () => {
    store().setSpeed('tm', 'max')
    store().editTm((t) => ({ ...t, name: 'X' }))
    store().loadTm(tmExample)
    expect(store().tmRun.speed).toBe('max')
  })

  it('the two machine types do not disturb each other', () => {
    store().setInput('pda', '((')
    store().editTm((t) => ({ ...t, name: 'X' }))
    expect(store().pdaRun.input).toBe('((')
  })
})

describe('undoing a load', () => {
  it('remembers what a load replaced and puts it back', () => {
    store().editPda((p) => ({ ...p, name: 'My work' }))
    store().loadPda(PDA_EXAMPLES[0].machine)
    expect(store().pda.name).toBe(PDA_EXAMPLES[0].machine.name)
    store().restorePrevious('pda')
    expect(store().pda.name).toBe('My work')
    expect(store().previous.pda).toBeNull() // once only
  })

  it('works for Turing machines, independently of the PDA', () => {
    store().loadPda(PDA_EXAMPLES[0].machine)
    store().loadTm(TM_EXAMPLES[0].machine)
    store().restorePrevious('tm')
    expect(store().tm.name).toBe(tmExample.name)
    expect(store().previous.pda).not.toBeNull()
  })

  it('does nothing when there is nothing to restore', () => {
    useMachineStore.setState({ previous: { pda: null, tm: null } })
    const before = store().pda
    store().restorePrevious('pda')
    expect(store().pda).toBe(before)
  })
})

describe('running', () => {
  it('sends the machine and input to the backend and keeps the answer', async () => {
    store().setInput('pda', '(())')
    vi.mocked(runPda).mockResolvedValue(pdaResult(4))
    await store().run('pda')
    expect(runPda).toHaveBeenCalledWith(pdaExample, '(())')
    expect(store().pdaRun.result?.steps).toHaveLength(4)
    expect(store().pdaRun).toMatchObject({ running: false, step: 0, error: null })
  })

  it('runs a Turing machine the same way', async () => {
    store().setInput('tm', 'aba')
    vi.mocked(runTm).mockResolvedValue(tmResult(5))
    await store().run('tm')
    expect(runTm).toHaveBeenCalledWith(tmExample, 'aba')
    expect(store().tmRun.result?.output).toBe('1')
  })

  it('shows a readable error and no result', async () => {
    vi.mocked(runPda).mockRejectedValue(
      new ApiError("Input symbol 'x' at position 0 is not in the alphabet.", 400, {
        code: 'INPUT_SYMBOL',
        position: 0,
      }),
    )
    await store().run('pda')
    expect(store().pdaRun.error).toMatch(/Input symbol 'x'/)
    expect(store().pdaRun.result).toBeNull()
    expect(store().pdaRun.running).toBe(false)
  })

  it('turns an invalid-machine error into a sentence listing the problems', async () => {
    vi.mocked(runTm).mockRejectedValue(
      new ApiError('x', 400, {
        code: 'INVALID_AUTOMATON',
        issues: [
          {
            severity: 'error',
            code: 'NO_START',
            message: 'No start state is set.',
            stateIds: [],
            transitionIndices: [],
          },
        ],
      }),
    )
    await store().run('tm')
    expect(store().tmRun.error).toBe('Fix the machine first: No start state is set.')
  })

  it('ignores an answer that arrives after the machine changed', async () => {
    let resolve!: (r: PdaRunResponse) => void
    vi.mocked(runPda).mockReturnValue(new Promise((r) => (resolve = r)))
    const pending = store().run('pda')
    store().editPda((p) => ({ ...p, name: 'Changed' }))
    resolve(pdaResult(3))
    await pending
    expect(store().pdaRun.result).toBeNull()
  })

  it('ignores an answer that arrives after the input changed', async () => {
    store().setInput('tm', 'a')
    let resolve!: (r: TmRunResponse) => void
    vi.mocked(runTm).mockReturnValue(new Promise((r) => (resolve = r)))
    const pending = store().run('tm')
    store().setInput('tm', 'ab')
    resolve(tmResult(3))
    await pending
    expect(store().tmRun.result).toBeNull()
  })
})

describe('stepping', () => {
  it('clamps to the recorded steps', async () => {
    vi.mocked(runPda).mockResolvedValue(pdaResult(4))
    await store().run('pda')
    store().gotoStep('pda', -4)
    expect(store().pdaRun.step).toBe(0)
    store().gotoStep('pda', 99)
    expect(store().pdaRun.step).toBe(3)
  })

  it('stops playing at the last step', async () => {
    vi.mocked(runTm).mockResolvedValue(tmResult(3))
    await store().run('tm')
    store().setPlaying('tm', true)
    store().gotoStep('tm', 1)
    expect(store().tmRun.playing).toBe(true)
    store().gotoStep('tm', 2)
    expect(store().tmRun.playing).toBe(false)
  })

  it('with no run yet there is only step 0', () => {
    store().gotoStep('pda', 5)
    expect(store().pdaRun.step).toBe(0)
  })
})

describe('validation', () => {
  it('stores the issues the backend reports', async () => {
    const issues = [
      {
        severity: 'warning' as const,
        code: 'NO_ACCEPTING',
        message: 'None.',
        stateIds: [],
        transitionIndices: [],
      },
    ]
    vi.mocked(validatePda).mockResolvedValue({ issues })
    await validateMachine('pda')
    expect(store().validation.pda).toEqual({ issues, error: null })
  })

  it('records why validation could not run, without losing the machine', async () => {
    vi.mocked(validateTm).mockRejectedValue(new ApiError('Cannot reach the backend.'))
    await validateMachine('tm')
    expect(store().validation.tm).toEqual({ issues: null, error: 'Cannot reach the backend.' })
    expect(store().tm).toBe(tmExample)
  })
})
