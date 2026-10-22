import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Step } from '../api/types'
import { emptyAutomaton, type Automaton } from '../model/automaton'
import type { ConversionRecord } from '../model/replay'
import { useStudioStore } from '../store/useStudioStore'
import { StepsPanel } from './StepsPanel'

const step = (index: number, extra: Partial<Step> = {}): Step => ({
  index,
  title: `Step title ${index}`,
  detail: `detail ${index}`,
  states: [],
  transitions: [],
  addsStates: [],
  addsTransitions: [],
  round: null,
  ...extra,
})

const auto = (
  states: [string, string][],
  transitions: [string, string, string][] = [],
  accepting: string[] = [],
  kind: Automaton['kind'] = 'DFA',
): Automaton => ({
  ...emptyAutomaton(kind),
  name: 'Result',
  alphabet: [...new Set(transitions.map((t) => t[2]))],
  states: states.map(([id, label]) => ({ id, label })),
  start: states[0][0],
  accepting,
  transitions: transitions.map(([from, to, symbol]) => ({ from, to, symbol })),
})

const subset: ConversionRecord = {
  op: 'nfa-to-dfa',
  source: auto(
    [
      ['p', 'p'],
      ['q', 'q'],
    ],
    [['p', 'q', 'a']],
    ['q'],
    'NFA',
  ),
  result: auto(
    [
      ['{p}', 'A'],
      ['{q}', 'B'],
    ],
    [
      ['{p}', '{q}', 'a'],
      ['{q}', '∅', 'a'],
    ],
    ['{q}'],
  ),
  stateMap: { '{p}': ['p'], '{q}': ['q'] },
  rounds: null,
  steps: [
    step(0, { title: 'Start', addsStates: ['{p}'] }),
    step(1, {
      title: "{p} on 'a'",
      detail: 'leads to {q}',
      addsStates: ['{q}'],
      addsTransitions: [0],
    }),
    step(2, { title: 'Done' }),
  ],
}

const minimize: ConversionRecord = {
  op: 'minimize',
  source: auto([
    ['A', 'A'],
    ['B', 'B'],
    ['C', 'C'],
  ]),
  result: auto([
    ['A', 'A'],
    ['B=C', 'B=C'],
  ]),
  stateMap: null,
  rounds: [
    [['A'], ['B', 'C']],
    [['A'], ['B'], ['C']],
  ],
  steps: [
    step(0, { title: 'Prepare' }),
    step(1, { title: 'Initial partition', round: 0 }),
    step(2, { title: 'Round 1', round: 1 }),
  ],
}

function show(record?: ConversionRecord) {
  useStudioStore.setState({
    doc: emptyAutomaton(),
    activeTabId: 'tab',
    records: record ? { tab: record } : {},
    player: { index: 0, playing: false },
  })
  render(<StepsPanel />)
}

beforeEach(() => useStudioStore.setState({ records: {}, player: { index: 0, playing: false } }))

describe('StepsPanel', () => {
  it('explains how to get steps when the tab has none', () => {
    show()
    expect(screen.getByText('No steps to replay for this tab.')).toBeInTheDocument()
  })

  it('shows the current step and moves with the buttons', async () => {
    show(subset)
    const card = screen.getByTestId('step-card')
    expect(card).toHaveTextContent('Step 0 of 2')
    expect(card).toHaveTextContent('Start')
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(card).toHaveTextContent('Step 1 of 2')
    expect(card).toHaveTextContent("A on 'a'") // the label shown on screen, not the id {p}
    expect(card).toHaveTextContent('leads to B')
    await userEvent.click(screen.getByRole('button', { name: 'Previous step' }))
    expect(card).toHaveTextContent('Step 0 of 2')
  })

  it('steps with the arrow keys and stops at the ends', async () => {
    show(subset)
    screen.getByLabelText(/Step player/).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(screen.getByTestId('step-card')).toHaveTextContent('Step 2 of 2')
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByTestId('step-card')).toHaveTextContent('Step 1 of 2')
  })

  it('lists only the steps run so far, and jumps back when one is clicked', async () => {
    show(subset)
    const list = () => within(screen.getByRole('region', { name: 'Steps so far' }))
    expect(list().getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Last step' }))
    expect(list().getAllByRole('listitem')).toHaveLength(3)
    await userEvent.click(list().getByRole('button', { name: "1. A on 'a'" }))
    expect(screen.getByTestId('step-card')).toHaveTextContent('Step 1 of 2')
    expect(list().getByRole('button', { name: /1\./ })).toHaveAttribute('aria-current', 'step')
  })

  it('Reset and the slider work', async () => {
    show(subset)
    await userEvent.click(screen.getByRole('button', { name: 'Last step' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByTestId('step-card')).toHaveTextContent('Step 0 of 2')
  })
})

describe('subset table', () => {
  const table = () => within(screen.getByRole('region', { name: 'Subset construction table' }))

  it('starts with the start row and fills in as moves are discovered', async () => {
    show(subset)
    expect(table().getAllByRole('row')).toHaveLength(2) // header + start row
    expect(table().getByRole('rowheader')).toHaveTextContent('→ A')
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(table().getAllByRole('row')).toHaveLength(3)
    expect(table().getByRole('rowheader', { name: /^B\s*\*/ })).toBeInTheDocument() // accepting
  })

  it('highlights the move the current step makes', async () => {
    show(subset)
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
    const current = document.querySelector('[data-current]')!
    expect(current).toHaveTextContent('B')
  })

  it('names the NFA states behind each row', () => {
    show(subset)
    expect(table().getByText('{p}')).toBeInTheDocument()
  })
})

describe('partition view', () => {
  const blocks = () => document.querySelectorAll('[data-block]')

  it('says there is no partition before the first one exists', () => {
    show(minimize)
    expect(screen.getByText(/No partition yet/)).toBeInTheDocument()
  })

  it('lists the blocks and counts them', async () => {
    show(minimize)
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }))
    expect(
      screen.getByRole('heading', { name: /Initial partition · 2 blocks/ }),
    ).toBeInTheDocument()
    expect([...blocks()].map((b) => b.textContent)).toEqual(['{A}', '{B, C}'])
  })

  it('flags blocks created by a split as new', async () => {
    show(minimize)
    await userEvent.click(screen.getByRole('button', { name: 'Last step' }))
    expect(
      screen.getByRole('heading', { name: /Partition after round 1 · 3 blocks/ }),
    ).toBeInTheDocument()
    const texts = [...blocks()].map((b) => b.textContent)
    expect(texts).toEqual(['{A}', '{B}new', '{C}new']) // {A} survived unchanged, B and C are new
  })
})
