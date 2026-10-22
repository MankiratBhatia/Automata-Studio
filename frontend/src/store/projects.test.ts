import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Automaton, Project, ProjectSummary } from '../api/types'

vi.mock('../api/client', async (orig) => ({
  ...(await orig<typeof import('../api/client')>()),
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}))

import {
  ApiError,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../api/client'
import { emptyAutomaton } from '../model/automaton'
import { loadWorkspace, saveWorkspace } from './persistence'
import { selectWorkspace, useStudioStore } from './useStudioStore'

const store = () => useStudioStore.getState()
const at = { x: 0, y: 0 }

const named = (name: string, states = ['a']): Automaton => ({
  ...emptyAutomaton(),
  name,
  states: states.map((id) => ({ id, label: id, position: at })),
  start: states[0],
})
const project = (id: string, a: Automaton): Project => ({
  id,
  name: a.name,
  kind: a.kind,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-02T00:00:00+00:00',
  automaton: a,
})
const summary = (id: string, name: string): ProjectSummary => ({
  id,
  name,
  kind: 'DFA',
  createdAt: 'x',
  updatedAt: '2026-01-02T00:00:00+00:00',
})
const toasts = () => store().toasts.map((t) => [t.kind, t.message])
const tab = () => store().tabs.find((t) => t.id === store().activeTabId)!

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  const blank = { id: 'blank', doc: emptyAutomaton() }
  useStudioStore.setState({
    tabs: [blank],
    activeTabId: blank.id,
    doc: blank.doc,
    history: {},
    toasts: [],
    projects: { open: false, loading: false, error: null, items: null },
  })
  vi.mocked(listProjects).mockResolvedValue([])
})

describe('saving', () => {
  it('the first save creates a project and links the tab to it', async () => {
    store().openInNewTab(named('Demo'))
    vi.mocked(createProject).mockResolvedValue(project('p1', named('Demo')))
    await store().saveProject()
    expect(createProject).toHaveBeenCalledWith(store().doc)
    expect(tab().projectId).toBe('p1')
    expect(tab().saved).toBe(store().doc)
    expect(toasts()).toEqual([['success', 'Saved “Demo”.']])
  })

  it('later saves update the same project instead of creating another', async () => {
    store().openInNewTab(named('Demo'))
    vi.mocked(createProject).mockResolvedValue(project('p1', named('Demo')))
    await store().saveProject()
    store().renameState('a', 'z')
    vi.mocked(updateProject).mockResolvedValue(project('p1', named('Demo')))
    await store().saveProject()
    expect(createProject).toHaveBeenCalledTimes(1)
    expect(updateProject).toHaveBeenCalledWith('p1', store().doc)
  })

  it('an edit after saving makes the tab differ from its saved copy', async () => {
    store().openInNewTab(named('Demo'))
    vi.mocked(createProject).mockResolvedValue(project('p1', named('Demo')))
    await store().saveProject()
    expect(store().doc).toBe(tab().saved)
    store().toggleAccepting('a')
    expect(store().doc).not.toBe(tab().saved)
  })

  it('there is nothing to save on an empty canvas', async () => {
    await store().saveProject()
    expect(createProject).not.toHaveBeenCalled()
    expect(toasts()).toEqual([['info', 'Nothing to save yet. Add a state first.']])
  })

  it('a backend outage is reported without losing the local copy', async () => {
    store().openInNewTab(named('Demo'))
    vi.mocked(createProject).mockRejectedValue(new ApiError('Cannot reach the backend.'))
    await store().saveProject()
    expect(store().toasts[0]).toMatchObject({ kind: 'error' })
    expect(store().toasts[0].message).toContain('Cannot reach the backend.')
    expect(store().toasts[0].message).toContain('still kept in this browser')
    expect(tab().projectId).toBeUndefined()
  })

  it('if the project was deleted elsewhere, the work is saved as a new one', async () => {
    store().openInNewTab(named('Demo'))
    vi.mocked(createProject).mockResolvedValueOnce(project('old', named('Demo')))
    await store().saveProject()
    vi.mocked(updateProject).mockRejectedValue(new ApiError('gone', 404, { code: 'NOT_FOUND' }))
    vi.mocked(createProject).mockResolvedValueOnce(project('new', named('Demo')))
    await store().saveProject()
    expect(tab().projectId).toBe('new')
  })
})

describe('opening and deleting', () => {
  it('opens a project in a new tab, linked and clean', async () => {
    store().openInNewTab(named('Other'))
    vi.mocked(getProject).mockResolvedValue(project('p9', named('Saved one', ['x', 'y'])))
    store().openProjects()
    await store().openProject('p9')
    expect(store().doc.name).toBe('Saved one')
    expect(store().tabs).toHaveLength(2)
    expect(tab().projectId).toBe('p9')
    expect(tab().saved).toBe(store().doc)
    expect(store().projects.open).toBe(false)
  })

  it('opening a project that is already open just switches to its tab', async () => {
    store().openInNewTab(named('Mine'))
    vi.mocked(createProject).mockResolvedValue(project('p1', named('Mine')))
    await store().saveProject()
    const mine = store().activeTabId
    store().openInNewTab(named('Elsewhere'))
    await store().openProject('p1')
    expect(getProject).not.toHaveBeenCalled()
    expect(store().activeTabId).toBe(mine)
    expect(store().tabs).toHaveLength(2)
  })

  it('a failed open is reported and opens nothing', async () => {
    vi.mocked(getProject).mockRejectedValue(new ApiError('No saved project with that id.', 404))
    await store().openProject('nope')
    expect(store().toasts[0].kind).toBe('error')
    expect(store().tabs).toHaveLength(1)
  })

  it('deleting unlinks the tabs that were showing it and refreshes the list', async () => {
    store().openInNewTab(named('Mine'))
    vi.mocked(createProject).mockResolvedValue(project('p1', named('Mine')))
    await store().saveProject()
    vi.mocked(deleteProject).mockResolvedValue()
    await store().removeProject('p1')
    expect(deleteProject).toHaveBeenCalledWith('p1')
    expect(tab().projectId).toBeUndefined()
    expect(listProjects).toHaveBeenCalled()
    expect(toasts().at(-1)).toEqual(['info', 'Project deleted.'])
  })

  it('a failed delete leaves the link alone', async () => {
    store().openInNewTab(named('Mine'))
    vi.mocked(createProject).mockResolvedValue(project('p1', named('Mine')))
    await store().saveProject()
    vi.mocked(deleteProject).mockRejectedValue(new ApiError('boom', 500))
    await store().removeProject('p1')
    expect(tab().projectId).toBe('p1')
    expect(toasts().at(-1)?.[0]).toBe('error')
  })
})

describe('the project list', () => {
  it('opening the dialog loads the list', async () => {
    vi.mocked(listProjects).mockResolvedValue([summary('a', 'A'), summary('b', 'B')])
    store().openProjects()
    expect(store().projects.open).toBe(true)
    await vi.waitFor(() => expect(store().projects.items).toHaveLength(2))
    expect(store().projects.loading).toBe(false)
  })

  it('a failed load shows an error instead of an empty list', async () => {
    vi.mocked(listProjects).mockRejectedValue(new ApiError('Cannot reach the backend.'))
    await store().refreshProjects()
    expect(store().projects.error).toBe('Cannot reach the backend.')
    expect(store().projects.items).toBeNull()
  })
})

describe('the link survives a reload', () => {
  it('projectId is saved with the workspace', async () => {
    store().openInNewTab(named('Mine'))
    vi.mocked(createProject).mockResolvedValue(project('p1', named('Mine')))
    await store().saveProject()
    saveWorkspace(selectWorkspace(store()))
    expect(loadWorkspace()?.tabs.find((t) => t.projectId === 'p1')).toBeDefined()
  })
})
