import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useMode } from '../mode'
import { ModeSwitch } from '../ModeSwitch'
import { useStudioStore } from '../store/useStudioStore'
import { StatesEditor } from './editorParts'
import { PDA_EXAMPLES, TM_EXAMPLES } from './examples'
import { MachineToolbar } from './MachineToolbar'
import { StackView } from './PdaApp'
import { useMachineStore } from './useMachineStore'

describe('StackView', () => {
  it('lists the stack from the top down and marks the top', () => {
    render(<StackView stack="AZ" />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((i) => i.textContent?.replace('top', '').trim())).toEqual(['A', 'Z'])
    expect(within(items[0]).getByText('top')).toBeInTheDocument()
    expect(screen.getByLabelText('Stack, top first: A, Z')).toBeInTheDocument()
  })

  it('says so when the stack is empty', () => {
    render(<StackView stack="" />)
    expect(screen.getByText('empty')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('StatesEditor', () => {
  const setup = (onRename: (id: string, name: string) => string | null) => {
    const calls: string[] = []
    render(
      <StatesEditor
        states={[{ id: 'q0' }, { id: 'q1' }]}
        start="q0"
        accepting={['q1']}
        rejecting={['q0']}
        onAdd={() => calls.push('add')}
        onRename={onRename}
        onRemove={(id) => calls.push(`remove ${id}`)}
        onStart={(id) => calls.push(`start ${id}`)}
        onAccepting={(id) => calls.push(`accepting ${id}`)}
        onRejecting={(id) => calls.push(`rejecting ${id}`)}
      />,
    )
    return calls
  }

  it('shows each state with its flags', () => {
    setup(() => null)
    expect(screen.getByLabelText('q0 is the start state')).toBeChecked()
    expect(screen.getByLabelText('q1 is the start state')).not.toBeChecked()
    expect(screen.getByLabelText('q1 is an accepting state')).toBeChecked()
    expect(screen.getByLabelText('q0 is a rejecting state')).toBeChecked()
  })

  it('reports clicks to the right handler', async () => {
    const calls = setup(() => null)
    await userEvent.click(screen.getByLabelText('q1 is the start state'))
    await userEvent.click(screen.getByLabelText('q0 is an accepting state'))
    await userEvent.click(screen.getByLabelText('q1 is a rejecting state'))
    await userEvent.click(screen.getByRole('button', { name: 'Delete state q1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add state' }))
    expect(calls).toEqual(['start q1', 'accepting q0', 'rejecting q1', 'remove q1', 'add'])
  })

  it('renames when you leave the field', async () => {
    const renames: [string, string][] = []
    setup((id, name) => (renames.push([id, name]), null))
    const input = screen.getByLabelText('Name of state q0')
    await userEvent.clear(input)
    await userEvent.type(input, 'start{Enter}')
    expect(renames).toEqual([['q0', 'start']])
  })

  it('shows why a rename was refused and keeps the real name', async () => {
    setup(() => 'Another state is already called “q1”.')
    const input = screen.getByLabelText('Name of state q0')
    await userEvent.clear(input)
    await userEvent.type(input, 'q1{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent('already called “q1”')
    expect(input).toHaveValue('q0')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })

  it('does not ask for a rename when the name did not change', async () => {
    const renames: string[] = []
    setup((id) => (renames.push(id), null))
    await userEvent.click(screen.getByLabelText('Name of state q0'))
    await userEvent.tab()
    expect(renames).toEqual([])
  })

  it('has a Reject column only for machines that have rejecting states', () => {
    render(
      <StatesEditor
        states={[{ id: 'q0' }]}
        start="q0"
        accepting={[]}
        onAdd={() => {}}
        onRename={() => null}
        onRemove={() => {}}
        onStart={() => {}}
        onAccepting={() => {}}
      />,
    )
    expect(screen.queryByRole('columnheader', { name: 'Reject' })).toBeNull()
  })
})

describe('ModeSwitch', () => {
  beforeEach(() => useMode.setState({ mode: 'fa' }))

  it('marks the current mode and changes it on click', async () => {
    render(<ModeSwitch />)
    expect(screen.getByRole('button', { name: 'Finite automata' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Turing machines' }))
    expect(useMode.getState().mode).toBe('tm')
    expect(screen.getByRole('button', { name: 'Turing machines' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Finite automata' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('remembers the choice', async () => {
    render(<ModeSwitch />)
    await userEvent.click(screen.getByRole('button', { name: 'Pushdown automata' }))
    expect(localStorage.getItem('automata-studio:mode')).toBe('pda')
  })
})

describe('MachineToolbar', () => {
  beforeEach(() => {
    useStudioStore.setState({ toasts: [] })
    useMachineStore.setState({
      pda: PDA_EXAMPLES[0].machine,
      tm: TM_EXAMPLES[0].machine,
      previous: { pda: null, tm: null },
    })
  })

  it('lists the examples for its own kind of machine', () => {
    render(<MachineToolbar kind="tm" />)
    const options = within(screen.getByRole('combobox', { name: 'Load example' })).getAllByRole(
      'option',
    )
    expect(options.slice(1).map((o) => o.textContent)).toEqual(TM_EXAMPLES.map((e) => e.title))
  })

  it('loads an example, and "Undo load" brings the old machine back', async () => {
    render(<MachineToolbar kind="pda" />)
    expect(screen.getByRole('button', { name: 'Undo load' })).toBeDisabled()
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Load example' }),
      'pda_balanced',
    )
    expect(useMachineStore.getState().pda.name).toBe('Balanced parentheses')
    await userEvent.click(screen.getByRole('button', { name: 'Undo load' }))
    expect(useMachineStore.getState().pda.name).toBe(PDA_EXAMPLES[0].machine.name)
    expect(screen.getByRole('button', { name: 'Undo load' })).toBeDisabled()
  })

  it('New starts an empty machine', async () => {
    render(<MachineToolbar kind="tm" />)
    await userEvent.click(screen.getByRole('button', { name: 'New' }))
    expect(useMachineStore.getState().tm.states).toEqual([])
  })

  it('refuses a file of the wrong kind with a readable message', async () => {
    render(<MachineToolbar kind="tm" />)
    const pdaFile = new File([JSON.stringify(PDA_EXAMPLES[0].machine)], 'a.json', {
      type: 'application/json',
    })
    await userEvent.upload(screen.getByLabelText('Import machine file'), pdaFile)
    await waitFor(() => expect(useStudioStore.getState().toasts).toHaveLength(1))
    expect(useStudioStore.getState().toasts[0]).toMatchObject({ kind: 'error' })
    expect(useStudioStore.getState().toasts[0].message).toMatch(
      /Could not import a\.json: .*tapeAlphabet/,
    )
    expect(useMachineStore.getState().tm.name).toBe(TM_EXAMPLES[0].machine.name) // unchanged
  })

  it('imports a good file', async () => {
    render(<MachineToolbar kind="pda" />)
    const file = new File([JSON.stringify(PDA_EXAMPLES[2].machine)], 'b.json', {
      type: 'application/json',
    })
    await userEvent.upload(screen.getByLabelText('Import machine file'), file)
    await screen.findByRole('button', { name: 'Undo load' })
    expect(useMachineStore.getState().pda.name).toBe(PDA_EXAMPLES[2].machine.name)
  })
})
