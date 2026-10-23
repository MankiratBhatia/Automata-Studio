import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAutomaton } from './model/automaton'
import { useMachineStore } from './machines/useMachineStore'
import { useMode } from './mode'
import { handleShortcut } from './shortcuts'
import { useStudioStore } from './store/useStudioStore'

const store = () => useStudioStore.getState()
const at = { x: 0, y: 0 }

function press(key: string, opts: KeyboardEventInit = {}, target?: Element): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })
  if (target) Object.defineProperty(e, 'target', { value: target })
  handleShortcut(e)
  return e
}

const el = (html: string): Element => {
  const d = document.createElement('div')
  d.innerHTML = html
  document.body.append(d)
  return d.firstElementChild!
}

beforeEach(() => {
  useMode.setState({ mode: 'fa' })
  const blank = { id: 'blank', doc: emptyAutomaton() }
  useStudioStore.setState({
    tabs: [blank],
    activeTabId: blank.id,
    doc: blank.doc,
    history: {},
    records: {},
    selection: null,
    sim: { input: '', trace: null, step: 0, playing: false, running: false, error: null },
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
    sideTab: 'edit',
    helpOpen: false,
    prompt: null,
    projects: { open: false, loading: false, error: null, items: null },
  })
})
afterEach(() => (document.body.innerHTML = ''))

describe('editing shortcuts', () => {
  it('S adds a state, each in a fresh place', () => {
    press('s')
    press('S')
    const [a, b] = store().doc.states
    expect(store().doc.states).toHaveLength(2)
    expect(a.position).not.toEqual(b.position)
  })

  it('S types normally inside a text field', () => {
    const input = el('<input />')
    const e = press('s', {}, input)
    expect(store().doc.states).toHaveLength(0)
    expect(e.defaultPrevented).toBe(false)
  })

  it('S does nothing while a replay is on screen (it is read-only)', () => {
    useStudioStore.setState({ sideTab: 'steps', records: { blank: {} as never } })
    press('s')
    expect(store().doc.states).toHaveLength(0)
  })

  it('Ctrl+Z undoes and Ctrl+Y or Ctrl+Shift+Z redoes', () => {
    store().addStateAt(at)
    press('z', { ctrlKey: true })
    expect(store().doc.states).toHaveLength(0)
    press('y', { ctrlKey: true })
    expect(store().doc.states).toHaveLength(1)
    press('z', { ctrlKey: true })
    press('z', { ctrlKey: true, shiftKey: true })
    expect(store().doc.states).toHaveLength(1)
  })

  it('Cmd+Z works as well (macOS)', () => {
    store().addStateAt(at)
    press('z', { metaKey: true })
    expect(store().doc.states).toHaveLength(0)
  })

  it('leaves Ctrl+Z to a text field, which has its own undo', () => {
    store().addStateAt(at)
    const e = press('z', { ctrlKey: true }, el('<textarea></textarea>'))
    expect(store().doc.states).toHaveLength(1)
    expect(e.defaultPrevented).toBe(false)
  })

  it('Escape clears the selection', () => {
    store().select({ kind: 'state', id: 'q0' })
    press('Escape')
    expect(store().selection).toBeNull()
  })
})

describe('save and help', () => {
  it('Ctrl+S saves, even from a text field, and stops the browser save dialog', () => {
    const save = vi.fn().mockResolvedValue(undefined)
    useStudioStore.setState({ saveProject: save })
    const e = press('s', { ctrlKey: true }, el('<input />'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it('? opens the shortcut list', () => {
    press('?')
    expect(store().helpOpen).toBe(true)
  })
})

describe('Space', () => {
  const withSimulation = () =>
    useStudioStore.setState({
      sideTab: 'simulate',
      sim: {
        input: 'a',
        step: 0,
        playing: false,
        running: false,
        error: null,
        trace: {
          accepted: true,
          stuck: false,
          steps: [0, 1, 2].map((index) => ({
            index,
            title: '',
            detail: '',
            states: [],
            transitions: [],
            position: index,
            symbol: null,
          })),
        },
      },
    })

  it('steps a simulation forward and does not scroll the page', () => {
    withSimulation()
    const e = press(' ')
    expect(store().sim.step).toBe(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it('leaves Space alone on a button, where it means "press"', () => {
    withSimulation()
    const e = press(' ', {}, el('<button>Run</button>'))
    expect(store().sim.step).toBe(0)
    expect(e.defaultPrevented).toBe(false)
  })

  it('does nothing when there is nothing to step through', () => {
    useStudioStore.setState({ sideTab: 'simulate' })
    expect(press(' ').defaultPrevented).toBe(false)
  })

  it('steps the player on the Steps tab', () => {
    useStudioStore.setState({
      sideTab: 'steps',
      records: {
        blank: {
          op: 'regex',
          source: null,
          result: emptyAutomaton(),
          stateMap: null,
          rounds: null,
          steps: [0, 1, 2].map((index) => ({
            index,
            title: '',
            detail: '',
            states: [],
            transitions: [],
            addsStates: [],
            addsTransitions: [],
            round: null,
          })),
        },
      },
      player: { index: 0, playing: false },
    })
    press(' ')
    expect(store().player.index).toBe(1)
  })
})

describe('while a dialog is open', () => {
  it.each([
    ['help', { helpOpen: true }],
    ['projects', { projects: { open: true, loading: false, error: null, items: null } }],
    ['symbol prompt', { prompt: { from: 'a', to: 'b' } }],
  ])('single-key shortcuts are ignored (%s)', (_name, state) => {
    useStudioStore.setState(state)
    press('s')
    press('?')
    expect(store().doc.states).toHaveLength(0)
  })
})

describe('on the pushdown and Turing machine screens', () => {
  beforeEach(() => {
    const none = {
      input: '',
      step: 0,
      playing: false,
      running: false,
      error: null,
      speed: 'normal' as const,
      result: null,
    }
    useMachineStore.setState({ pdaRun: none, tmRun: none })
  })

  const withRun = (kind: 'pda' | 'tm') => {
    const steps = [0, 1, 2].map((index) => ({
      index,
      state: 'q0',
      position: index,
      head: index,
      stack: 'Z',
      transition: null,
      note: '',
      read: null,
      write: null,
      cell: null,
    }))
    const base = {
      input: 'ab',
      step: 0,
      playing: false,
      running: false,
      error: null,
      speed: 'normal' as const,
    }
    if (kind === 'pda') {
      useMachineStore.setState({
        pdaRun: {
          ...base,
          result: { verdict: 'accepted', closest: false, explored: 3, reason: '', steps },
        },
      })
    } else {
      useMachineStore.setState({
        tmRun: { ...base, result: { status: 'accepted', reason: '', output: '', steps } },
      })
    }
  }

  it('S does not add a state to the finite automaton hidden behind the screen', () => {
    for (const mode of ['pda', 'tm'] as const) {
      useMode.setState({ mode })
      const e = press('s')
      expect(store().doc.states).toHaveLength(0)
      expect(e.defaultPrevented).toBe(false)
    }
  })

  it('undo, redo and save are ignored too', () => {
    store().addStateAt(at)
    useMode.setState({ mode: 'pda' })
    press('z', { ctrlKey: true })
    expect(store().doc.states).toHaveLength(1)
    const save = vi.fn().mockResolvedValue(undefined)
    useStudioStore.setState({ saveProject: save })
    press('s', { ctrlKey: true })
    expect(save).not.toHaveBeenCalled()
  })

  it('? still opens the shortcut list', () => {
    useMode.setState({ mode: 'tm' })
    press('?')
    expect(store().helpOpen).toBe(true)
  })

  it.each(['pda', 'tm'] as const)('Space steps a %s run', (kind) => {
    useMode.setState({ mode: kind })
    withRun(kind)
    const e = press(' ')
    const run =
      kind === 'pda' ? useMachineStore.getState().pdaRun : useMachineStore.getState().tmRun
    expect(run.step).toBe(1)
    expect(e.defaultPrevented).toBe(true)
  })

  it('Space does nothing without a run, on a button, or in a text field', () => {
    useMode.setState({ mode: 'pda' })
    expect(press(' ').defaultPrevented).toBe(false)
    withRun('pda')
    press(' ', {}, el('<button>Run</button>'))
    press(' ', {}, el('<input />'))
    expect(useMachineStore.getState().pdaRun.step).toBe(0)
  })

  it('shortcuts return when you go back to finite automata', () => {
    useMode.setState({ mode: 'pda' })
    useMode.setState({ mode: 'fa' })
    press('s')
    expect(store().doc.states).toHaveLength(1)
  })
})
