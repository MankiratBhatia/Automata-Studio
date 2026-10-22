import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAutomaton } from './model/automaton'
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
