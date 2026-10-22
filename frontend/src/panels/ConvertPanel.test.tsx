import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAutomaton, type Automaton } from '../model/automaton'
import { useStudioStore } from '../store/useStudioStore'
import { ConvertPanel } from './ConvertPanel'

const withKind = (kind: Automaton['kind'], states = 2): Automaton => ({
  ...emptyAutomaton(kind),
  name: 'Sample',
  states: Array.from({ length: states }, (_, i) => ({
    id: `q${i}`,
    label: `q${i}`,
    position: { x: 0, y: 0 },
  })),
  start: 'q0',
})

const enabled = (name: string) =>
  !(screen.getByRole('button', { name }) as HTMLButtonElement).disabled

beforeEach(() => {
  useStudioStore.setState({
    doc: emptyAutomaton(),
    convert: { running: false, regexError: null, error: null, note: null },
  })
})

describe('ConvertPanel buttons follow the automaton kind', () => {
  it.each([
    ['ENFA', { eps: true, dfa: true, min: false }],
    ['NFA', { eps: false, dfa: true, min: false }],
    ['DFA', { eps: false, dfa: false, min: true }],
  ] as const)('%s', (kind, want) => {
    useStudioStore.setState({ doc: withKind(kind) })
    render(<ConvertPanel />)
    expect(enabled('Remove ε-transitions')).toBe(want.eps)
    expect(enabled('Convert to DFA')).toBe(want.dfa)
    expect(enabled('Minimise DFA')).toBe(want.min)
  })

  it('explains why a button is off', () => {
    useStudioStore.setState({ doc: withKind('NFA') })
    render(<ConvertPanel />)
    expect(screen.getByRole('button', { name: 'Minimise DFA' })).toHaveAttribute(
      'title',
      expect.stringMatching(/needs a DFA/),
    )
  })

  it('disables everything for an empty canvas', () => {
    render(<ConvertPanel />)
    expect(enabled('Convert to DFA')).toBe(false)
    expect(screen.getByText('Draw or load an automaton first.')).toBeInTheDocument()
  })
})

describe('regex section', () => {
  it('submits the pattern on Enter', async () => {
    const build = vi.fn().mockResolvedValue(true)
    useStudioStore.setState({ buildFromRegex: build })
    render(<ConvertPanel />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Regular expression' }), 'ab*{Enter}')
    expect(build).toHaveBeenCalledWith('ab*')
  })

  it('points a caret at the position of a syntax error', () => {
    useStudioStore.setState({
      convert: {
        running: false,
        error: null,
        note: null,
        regexError: { message: "Unmatched ')'.", position: 1, pattern: 'a)' },
      },
    })
    render(<ConvertPanel />)
    expect(screen.getByRole('alert')).toHaveTextContent("Unmatched ')'.")
    const pre = document.querySelector('pre')!
    expect(pre.textContent).toBe('a)\n ^')
  })

  it('shows the result note', () => {
    useStudioStore.setState({
      doc: withKind('DFA'),
      convert: { running: false, regexError: null, error: null, note: '5 states → 4 states.' },
    })
    render(<ConvertPanel />)
    expect(screen.getByRole('status')).toHaveTextContent('5 states → 4 states.')
  })
})
