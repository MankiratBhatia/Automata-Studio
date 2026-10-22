import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAutomaton } from '../model/automaton'
import { useStudioStore } from './useStudioStore'

const store = () => useStudioStore.getState()
const at = { x: 0, y: 0 }
const ids = () => store().doc.states.map((s) => s.id)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  localStorage.clear()
  const blank = { id: 'blank', doc: emptyAutomaton() }
  useStudioStore.setState({
    tabs: [blank],
    activeTabId: blank.id,
    doc: blank.doc,
    history: {},
    selection: null,
    records: {},
  })
})
afterEach(() => vi.useRealTimers())

/** Time passes, so consecutive edits are not merged into one undo step. */
const later = () => vi.advanceTimersByTime(2000)

describe('undo and redo', () => {
  it('undo restores the previous document and redo brings the change back', () => {
    store().addStateAt(at)
    later()
    store().addStateAt(at)
    expect(ids()).toEqual(['q0', 'q1'])
    store().undo()
    expect(ids()).toEqual(['q0'])
    store().undo()
    expect(ids()).toEqual([])
    store().redo()
    store().redo()
    expect(ids()).toEqual(['q0', 'q1'])
  })

  it('undo with nothing to undo changes nothing', () => {
    const before = store().doc
    store().undo()
    store().redo()
    expect(store().doc).toBe(before)
  })

  it('a new edit after an undo discards the redo history', () => {
    store().addStateAt(at)
    store().undo()
    later()
    store().addStateAt(at)
    store().redo()
    expect(ids()).toEqual(['q0']) // nothing was redone
    expect(store().history.blank.future).toEqual([])
  })

  it('undoes any kind of edit, not just adding states', () => {
    store().addStateAt(at)
    later()
    store().toggleAccepting('q0')
    expect(store().doc.accepting).toEqual(['q0'])
    store().undo()
    expect(store().doc.accepting).toEqual([])
    store().undo()
    later()
    store().addStateAt(at)
    later()
    store().addStateAt(at)
    later()
    store().openPrompt('q0', 'q1')
    store().applyPrompt('a')
    expect(store().doc.transitions).toHaveLength(1)
    store().undo()
    expect(store().doc.transitions).toEqual([])
  })

  it('keeps at most 100 undo steps', () => {
    for (let i = 0; i < 120; i++) {
      store().addStateAt(at)
      later()
    }
    expect(store().history.blank.past).toHaveLength(100)
    for (let i = 0; i < 100; i++) store().undo()
    expect(ids()).toHaveLength(20) // the oldest 20 steps fell off the end
  })

  it('discards a finished simulation and an obsolete selection', () => {
    store().addStateAt(at)
    later()
    store().addStateAt(at)
    store().select({ kind: 'state', id: 'q1' })
    store().undo()
    expect(store().selection).toBeNull()
    expect(store().sim.trace).toBeNull()
  })
})

describe('merging rapid edits', () => {
  it('typing a label is one undo step, not one per keystroke', () => {
    store().addStateAt(at)
    later()
    for (const label of ['A', 'Ab', 'Abc']) {
      store().renameState('q0', label)
      vi.advanceTimersByTime(100)
    }
    expect(store().doc.states[0].label).toBe('Abc')
    store().undo()
    expect(store().doc.states[0].label).toBe('q0')
  })

  it('a pause starts a new step', () => {
    store().addStateAt(at)
    later()
    store().renameState('q0', 'A')
    later()
    store().renameState('q0', 'B')
    store().undo()
    expect(store().doc.states[0].label).toBe('A')
  })

  it('renaming two different states is two steps', () => {
    store().addStateAt(at)
    later()
    store().addStateAt(at)
    later()
    store().renameState('q0', 'X')
    store().renameState('q1', 'Y')
    store().undo()
    expect(store().doc.states.map((s) => s.label)).toEqual(['X', 'q1'])
  })

  it('undoing in the middle of typing does not merge into the undone step', () => {
    store().addStateAt(at)
    later()
    store().renameState('q0', 'A')
    store().undo()
    store().renameState('q0', 'B')
    store().undo()
    expect(store().doc.states[0].label).toBe('q0')
  })
})

describe('dragging', () => {
  it('a whole drag is one undo step that puts the state back where it started', () => {
    store().addStateAt({ x: 10, y: 10 })
    later()
    store().beginMove()
    for (let i = 1; i <= 30; i++) store().moveState('q0', { x: 10 + i, y: 10 })
    expect(store().doc.states[0].position).toEqual({ x: 40, y: 10 })
    store().undo()
    expect(store().doc.states[0].position).toEqual({ x: 10, y: 10 })
    store().redo()
    expect(store().doc.states[0].position).toEqual({ x: 40, y: 10 })
  })

  it('a move on its own adds no undo step; only a drag start does', () => {
    store().addStateAt(at)
    store().moveState('q0', { x: 5, y: 5 })
    expect(store().history.blank.past).toHaveLength(1) // only the add, since no drag began
  })
})

describe('per-tab history', () => {
  it('each tab has its own, and switching tabs keeps them', () => {
    store().addStateAt(at) // tab 1
    const first = store().activeTabId
    store().openInNewTab(store().doc) // tab 2 (a copy)
    const second = store().activeTabId
    later()
    store().addStateAt(at)
    expect(store().history[second].past).toHaveLength(1)
    expect(store().history[first].past).toHaveLength(1)
    store().switchTab(first)
    store().undo()
    expect(ids()).toEqual([])
    store().switchTab(second)
    expect(ids()).toEqual(['q0', 'q1']) // untouched by the undo in the other tab
    store().undo()
    expect(ids()).toEqual(['q0'])
  })

  it('loading a document into a tab starts its history afresh', () => {
    store().addStateAt(at)
    store().loadDoc(emptyAutomaton())
    store().undo()
    expect(ids()).toEqual([])
  })

  it('closing a tab forgets its history', () => {
    store().addStateAt(at)
    const first = store().activeTabId
    store().openInNewTab(store().doc)
    store().closeTab(first)
    expect(store().history[first]).toBeUndefined()
  })
})
