import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EquivalenceResponse } from '../api/types'
import { emptyAutomaton, type Automaton } from '../model/automaton'
import { useStudioStore } from '../store/useStudioStore'
import { ComparePanel } from './ComparePanel'

const doc = (name: string): Automaton => ({ ...emptyAutomaton(), name })

const IDLE = {
  running: false,
  error: null,
  result: null,
  checked: null,
  sideBySide: false,
  traces: null,
  step: 0,
  playing: false,
}

function setup(tabs: [string, Automaton][], compare: object = {}) {
  const active = tabs[0]
  useStudioStore.setState({
    tabs: tabs.map(([id, d]) => ({ id, doc: d })),
    activeTabId: active[0],
    doc: active[1],
    compare: { aId: null, bId: null, ...IDLE, ...compare },
  })
}

const verdict = (over: Partial<EquivalenceResponse>): EquivalenceResponse => ({
  equivalent: false,
  counterexample: '00',
  aAccepts: true,
  bAccepts: false,
  explored: 7,
  ...over,
})

beforeEach(() => vi.restoreAllMocks())

describe('ComparePanel', () => {
  it('needs two tabs', () => {
    setup([['t1', doc('Only')]])
    render(<ComparePanel />)
    expect(screen.getByRole('button', { name: 'Check equivalence' })).toBeDisabled()
    expect(
      screen.getByText('Open a second automaton in another tab to compare.'),
    ).toBeInTheDocument()
  })

  it('defaults to the active tab against another one, and runs with those ids', async () => {
    setup([
      ['t1', doc('First')],
      ['t2', doc('Second')],
    ])
    const run = vi.fn().mockResolvedValue(undefined)
    useStudioStore.setState({ runEquivalence: run })
    render(<ComparePanel />)
    expect(screen.getByLabelText('Automaton A')).toHaveValue('t1')
    expect(screen.getByLabelText('Automaton B')).toHaveValue('t2')
    await userEvent.click(screen.getByRole('button', { name: 'Check equivalence' }))
    expect(run).toHaveBeenCalledWith('t1', 't2')
  })

  it('refuses to compare a tab with itself', async () => {
    setup([
      ['t1', doc('First')],
      ['t2', doc('Second')],
    ])
    render(<ComparePanel />)
    await userEvent.selectOptions(screen.getByLabelText('Automaton B'), 't1')
    expect(screen.getByRole('button', { name: 'Check equivalence' })).toBeDisabled()
    expect(screen.getByText('Pick two different tabs.')).toBeInTheDocument()
  })

  it('reports equivalence with the search size', () => {
    const a = doc('A')
    const b = doc('B')
    setup(
      [
        ['t1', a],
        ['t2', b],
      ],
      {
        aId: 't1',
        bId: 't2',
        result: verdict({
          equivalent: true,
          counterexample: null,
          aAccepts: null,
          bAccepts: null,
          explored: 1,
        }),
        checked: { a, b },
      },
    )
    render(<ComparePanel />)
    const r = screen.getByTestId('equivalence-result')
    expect(r).toHaveTextContent('Equivalent')
    expect(r).toHaveTextContent('1 state pair.')
    expect(screen.queryByRole('button', { name: 'Show both runs' })).toBeNull()
  })

  it('shows the counterexample and who accepts it', () => {
    const a = doc('A')
    const b = doc('B')
    setup(
      [
        ['t1', a],
        ['t2', b],
      ],
      { aId: 't1', bId: 't2', result: verdict({}), checked: { a, b } },
    )
    render(<ComparePanel />)
    expect(screen.getByTestId('counterexample')).toHaveTextContent('“00”')
    expect(screen.getByTestId('equivalence-result')).toHaveTextContent(
      'A accepts it; B rejects it.',
    )
    expect(screen.getByRole('button', { name: 'Show both runs' })).toBeInTheDocument()
  })

  it('names the empty string instead of showing nothing', () => {
    const a = doc('A')
    const b = doc('B')
    setup(
      [
        ['t1', a],
        ['t2', b],
      ],
      {
        aId: 't1',
        bId: 't2',
        result: verdict({ counterexample: '' }),
        checked: { a, b },
      },
    )
    render(<ComparePanel />)
    expect(screen.getByTestId('counterexample')).toHaveTextContent('ε (the empty string)')
  })

  it('warns when an automaton has changed since the check', () => {
    const a = doc('A')
    const b = doc('B')
    setup(
      [
        ['t1', { ...a, name: 'A edited' }],
        ['t2', b],
      ],
      {
        aId: 't1',
        bId: 't2',
        result: verdict({}),
        checked: { a, b },
      },
    )
    render(<ComparePanel />)
    expect(screen.getByText(/changed since this check/)).toBeInTheDocument()
  })

  it('shows no warning while nothing changed', () => {
    const a = doc('A')
    const b = doc('B')
    setup(
      [
        ['t1', a],
        ['t2', b],
      ],
      { aId: 't1', bId: 't2', result: verdict({}), checked: { a, b } },
    )
    render(<ComparePanel />)
    expect(screen.queryByText(/changed since this check/)).toBeNull()
  })

  it('shows an error from the backend', () => {
    setup(
      [
        ['t1', doc('A')],
        ['t2', doc('B')],
      ],
      { error: 'The result would have more than 512 states.' },
    )
    render(<ComparePanel />)
    expect(screen.getByRole('alert')).toHaveTextContent('more than 512 states')
  })
})
