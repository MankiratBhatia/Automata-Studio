import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HelpDialog } from './HelpDialog'
import { ProjectsDialog } from './ProjectsDialog'
import { ToastHost } from './ToastHost'
import { useStudioStore } from './store/useStudioStore'

const projects = (over: object = {}) =>
  useStudioStore.setState({
    projects: { open: true, loading: false, error: null, items: [], ...over },
  })

const item = (id: string, name: string, kind: 'DFA' | 'NFA' | 'ENFA' = 'DFA') => ({
  id,
  name,
  kind,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-02T03:04:05+00:00',
})

beforeEach(() => {
  useStudioStore.setState({
    tabs: [{ id: 't', doc: { ...useStudioStore.getState().doc } }],
    activeTabId: 't',
    toasts: [],
    helpOpen: false,
    projects: { open: false, loading: false, error: null, items: null },
    openProject: vi.fn().mockResolvedValue(undefined),
    removeProject: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue(undefined),
    refreshProjects: vi.fn().mockResolvedValue(undefined),
  })
})

describe('ProjectsDialog', () => {
  it('renders nothing while closed', () => {
    render(<ProjectsDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows a spinner message while the first load is running', () => {
    projects({ loading: true, items: null })
    render(<ProjectsDialog />)
    expect(screen.getByText(/Loading projects/)).toBeInTheDocument()
  })

  it('explains what to do when nothing is saved yet', () => {
    projects({ items: [] })
    render(<ProjectsDialog />)
    expect(screen.getByText(/No saved projects yet/)).toBeInTheDocument()
  })

  it('lists projects with their type, and offers Open and Delete for each', async () => {
    projects({ items: [item('a', 'Ends with 01'), item('b', 'Thompson', 'ENFA')] })
    render(<ProjectsDialog />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[1]).getByText(/ε-NFA/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Open Ends with 01' }))
    expect(useStudioStore.getState().openProject).toHaveBeenCalledWith('a')
  })

  it('marks a project that is already open in a tab', () => {
    useStudioStore.setState({
      tabs: [{ id: 't', doc: useStudioStore.getState().doc, projectId: 'a' }],
    })
    projects({ items: [item('a', 'Mine'), item('b', 'Other')] })
    render(<ProjectsDialog />)
    const [mine, other] = screen.getAllByRole('listitem')
    expect(within(mine).getByText('open')).toBeInTheDocument()
    expect(within(other).queryByText('open')).toBeNull()
  })

  it('needs two clicks to delete, so a slip does not destroy work', async () => {
    projects({ items: [item('a', 'Precious')] })
    render(<ProjectsDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Precious' }))
    expect(useStudioStore.getState().removeProject).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete Precious' }))
    expect(useStudioStore.getState().removeProject).toHaveBeenCalledWith('a')
  })

  it('moving focus away disarms a pending delete', async () => {
    projects({ items: [item('a', 'Precious')] })
    render(<ProjectsDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Precious' }))
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.getByRole('button', { name: 'Delete Precious' })).toBeInTheDocument()
    expect(useStudioStore.getState().removeProject).not.toHaveBeenCalled()
  })

  it('shows a load error instead of pretending the list is empty', () => {
    projects({ items: null, error: 'Cannot reach the backend. Is it running on port 8000?' })
    render(<ProjectsDialog />)
    expect(screen.getByRole('alert')).toHaveTextContent('Cannot reach the backend')
    expect(screen.queryByText(/No saved projects yet/)).toBeNull()
  })

  it('"Save current tab" saves, and Close closes', async () => {
    projects({ items: [] })
    render(<ProjectsDialog />)
    await userEvent.click(screen.getByRole('button', { name: 'Save current tab' }))
    expect(useStudioStore.getState().saveProject).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(useStudioStore.getState().projects.open).toBe(false)
  })
})

describe('HelpDialog', () => {
  it('lists the shortcuts and closes with the button', async () => {
    useStudioStore.setState({ helpOpen: true })
    render(<HelpDialog />)
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    expect(within(dialog).getByText('Ctrl+Z')).toBeInTheDocument()
    expect(within(dialog).getByText('Add a state')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(useStudioStore.getState().helpOpen).toBe(false)
  })

  it('renders nothing while closed', () => {
    render(<HelpDialog />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('ToastHost', () => {
  it('announces errors as alerts and other messages as polite status', () => {
    useStudioStore.setState({
      toasts: [
        { id: 1, kind: 'error', message: 'It broke' },
        { id: 2, kind: 'success', message: 'It worked' },
      ],
    })
    render(<ToastHost />)
    expect(screen.getByRole('alert')).toHaveTextContent('It broke')
    expect(screen.getByRole('status')).toHaveTextContent('It worked')
  })

  it('has a dismiss button that removes the toast', async () => {
    useStudioStore.setState({ toasts: [{ id: 7, kind: 'info', message: 'Hello' }] })
    render(<ToastHost />)
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(useStudioStore.getState().toasts).toEqual([])
  })
})
