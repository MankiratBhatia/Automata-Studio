import { create } from 'zustand'
import {
  ApiError,
  checkEquivalence,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  minimizeDfa,
  nfaToDfa,
  regexToNfa,
  removeEpsilon,
  simulate,
  simulateBatch,
  updateProject,
} from '../api/client'
import type {
  BatchResponse,
  ConvertResponse,
  EquivalenceResponse,
  Issue,
  ProjectSummary,
  SimulateResponse,
} from '../api/types'
import * as M from '../model/automaton'
import type { Automaton } from '../model/automaton'
import { ensurePositions } from '../model/layout'
import { relabelResult, type ConversionOp } from '../model/labels'
import type { ConversionRecord } from '../model/replay'
import { loadWorkspace, type SavedWorkspace } from './persistence'

export type Selection =
  { kind: 'state'; id: string } | { kind: 'edge'; from: string; to: string } | null

export interface Flagged {
  states: string[]
  transitions: number[]
}

interface SimState {
  input: string
  trace: SimulateResponse | null
  step: number
  playing: boolean
  running: boolean
  error: string | null
}

interface BatchState {
  text: string
  results: BatchResponse['results'] | null
  running: boolean
  error: string | null
}

/** One open automaton. The active tab's live document is `doc`; its copy here may be stale. */
export interface DocTab {
  id: string
  doc: Automaton
  /** The saved project this tab came from or was last saved as. */
  projectId?: string
  /** The document as of the last save; differing from the live one means unsaved changes. */
  saved?: Automaton
}

interface History {
  past: Automaton[]
  future: Automaton[]
}

interface ProjectsState {
  open: boolean
  loading: boolean
  error: string | null
  items: ProjectSummary[] | null
}

/** The operations that start from the automaton on screen (regex has no input automaton). */
export type SingleConversion = Exclude<ConversionOp, 'regex'>

export interface Toast {
  id: number
  kind: 'error' | 'success' | 'info'
  message: string
}

export type SideTab = 'edit' | 'validate' | 'simulate' | 'convert' | 'steps' | 'compare'

interface PlayerState {
  index: number
  playing: boolean
}

/** One automaton's run of the counterexample, or why it could not be run. */
export type TraceSide = { trace: SimulateResponse } | { note: string }

interface CompareState {
  /** Tab ids being compared; null means "pick a default". */
  aId: string | null
  bId: string | null
  running: boolean
  error: string | null
  result: EquivalenceResponse | null
  /** The two automata as they were when checked, so a later edit can mark the result stale. */
  checked: { a: Automaton; b: Automaton } | null
  /** Showing the counterexample on both automata side by side. */
  sideBySide: boolean
  traces: { a: TraceSide; b: TraceSide } | null
  step: number
  playing: boolean
}

interface ConvertState {
  running: boolean
  /** A regex syntax error, with where it happened so the UI can point at it. */
  regexError: { message: string; position: number | null; pattern: string } | null
  error: string | null
  /** One-line summary of the last successful conversion. */
  note: string | null
}

interface StudioState {
  doc: Automaton
  tabs: DocTab[]
  activeTabId: string
  /** Bumps whenever a whole new automaton is loaded, so the canvas can re-fit its view. */
  loadId: number
  selection: Selection
  /** Highlight requested by clicking a validation issue. */
  flagged: Flagged
  issues: Issue[] | null
  validationError: string | null
  /** Pending "which symbols?" prompt for a new or edited transition. */
  prompt: { from: string; to: string } | null
  sim: SimState
  batch: BatchState
  convert: ConvertState
  sideTab: SideTab
  toasts: Toast[]
  /** Undo/redo stacks, one pair per tab. */
  history: Record<string, History>
  projects: ProjectsState
  helpOpen: boolean
  /** Step-player data for the tab each conversion opened. Not saved across reloads. */
  records: Record<string, ConversionRecord>
  player: PlayerState
  compare: CompareState

  select: (s: Selection) => void
  addStateAt: (position: { x: number; y: number }) => void
  deleteState: (id: string) => void
  deleteEdge: (from: string, to: string) => void
  moveState: (id: string, position: { x: number; y: number }) => void
  renameState: (id: string, label: string) => void
  toggleAccepting: (id: string) => void
  setStart: (id: string | null) => void
  setKind: (kind: M.Kind) => void
  setName: (name: string) => void
  setAlphabet: (alphabet: string[]) => void
  addTrapState: () => void
  openPrompt: (from: string, to: string) => void
  closePrompt: () => void
  /** Returns an error message, or null when the symbols were applied. */
  applyPrompt: (text: string) => string | null
  loadDoc: (doc: Automaton) => void
  newDoc: () => void
  /** Open `doc` in a new tab (or in the current one if that is still blank). */
  openInNewTab: (doc: Automaton) => void
  newTab: () => void
  switchTab: (id: string) => void
  closeTab: (id: string) => void

  setSideTab: (tab: SideTab) => void
  setHelpOpen: (open: boolean) => void
  undo: () => void
  redo: () => void
  /** Call once when a drag starts, so the whole drag is a single undo step. */
  beginMove: () => void

  openProjects: () => void
  closeProjects: () => void
  refreshProjects: () => Promise<void>
  saveProject: () => Promise<void>
  openProject: (id: string) => Promise<void>
  removeProject: (id: string) => Promise<void>
  showToast: (kind: Toast['kind'], message: string) => void
  dismissToast: (id: number) => void
  gotoPlayerStep: (n: number) => void
  setPlayerPlaying: (playing: boolean) => void

  setCompareTabs: (aId: string, bId: string) => void
  runEquivalence: (aId: string, bId: string) => Promise<void>
  openSideBySide: () => Promise<void>
  closeSideBySide: () => void
  gotoCompareStep: (n: number) => void
  setComparePlaying: (playing: boolean) => void

  runConversion: (op: SingleConversion) => Promise<boolean>
  buildFromRegex: (pattern: string) => Promise<boolean>
  runPipeline: (pattern: string) => Promise<boolean>

  setIssues: (issues: Issue[] | null, error?: string | null) => void
  flag: (flagged: Flagged) => void

  setSimInput: (input: string) => void
  runSimulation: () => Promise<void>
  gotoStep: (n: number) => void
  setPlaying: (playing: boolean) => void
  resetSimulation: () => void
  setBatchText: (text: string) => void
  runBatch: () => Promise<void>
}

let toastCounter = 0
const HISTORY_LIMIT = 100
const COALESCE_MS = 1000
const NO_HISTORY: History = { past: [], future: [] }
/** The last undoable edit, so rapid repeats (typing a label) merge into one undo step. */
let lastEdit: { key: string; at: number } | null = null
const IDLE_PLAYER: PlayerState = { index: 0, playing: false }
const IDLE_COMPARE: Omit<CompareState, 'aId' | 'bId'> = {
  running: false,
  error: null,
  result: null,
  checked: null,
  sideBySide: false,
  traces: null,
  step: 0,
  playing: false,
}

/** The document in a tab: the live one for the active tab, the saved copy for others. */
export function docOfTab(
  st: Pick<StudioState, 'tabs' | 'activeTabId' | 'doc'>,
  id: string,
): Automaton | undefined {
  return id === st.activeTabId ? st.doc : st.tabs.find((t) => t.id === id)?.doc
}

const NO_FLAG: Flagged = { states: [], transitions: [] }
const IDLE_SIM: Omit<SimState, 'input'> = {
  trace: null,
  step: 0,
  playing: false,
  running: false,
  error: null,
}

const states = (n: number) => `${n} state${n === 1 ? '' : 's'}`
const newTabId = () => `t${Math.random().toString(36).slice(2, 8)}`

/** Tabs with the active one's stale snapshot replaced by the live document. */
function syncedTabs(st: Pick<StudioState, 'tabs' | 'activeTabId' | 'doc'>): DocTab[] {
  return st.tabs.map((t) => (t.id === st.activeTabId ? { ...t, doc: st.doc } : t))
}

export function selectWorkspace(
  st: Pick<StudioState, 'tabs' | 'activeTabId' | 'doc'>,
): SavedWorkspace {
  return { tabs: syncedTabs(st), activeId: st.activeTabId }
}

function describeError(e: unknown): string {
  if (e instanceof ApiError && e.code === 'INVALID_AUTOMATON') {
    return `Fix the automaton first: ${e.issues.map((i) => i.message).join(' ')}`
  }
  return e instanceof Error ? e.message : 'Something went wrong.'
}

/** Drop a selection that points at something that no longer exists. */
function sanitize(selection: Selection, doc: Automaton): Selection {
  if (selection?.kind === 'state' && !doc.states.some((s) => s.id === selection.id)) return null
  if (
    selection?.kind === 'edge' &&
    !doc.transitions.some((t) => t.from === selection.from && t.to === selection.to)
  ) {
    return null
  }
  return selection
}

export const useStudioStore = create<StudioState>()((set, get) => {
  /**
   * Apply an edit. Anything but a pure move changes the language, so a finished simulation
   * (which describes the old automaton) is discarded rather than left lying about.
   */
  /** Push the current document onto the undo stack (unless this edit merges with the last). */
  const withHistory = (st: StudioState, key?: string): Pick<StudioState, 'history'> => {
    const now = Date.now()
    const merge = key !== undefined && lastEdit?.key === key && now - lastEdit.at < COALESCE_MS
    lastEdit = key === undefined ? null : { key, at: now }
    if (merge) return { history: st.history }
    const h = st.history[st.activeTabId] ?? NO_HISTORY
    return {
      history: {
        ...st.history,
        [st.activeTabId]: { past: [...h.past, st.doc].slice(-HISTORY_LIMIT), future: [] },
      },
    }
  }

  const edit = (next: Automaton, key?: string) =>
    set((st) => ({
      doc: next,
      ...withHistory(st, key),
      selection: sanitize(st.selection, next),
      flagged: NO_FLAG,
      sim: { ...st.sim, ...IDLE_SIM },
      batch: { ...st.batch, results: null, error: null },
    }))

  /** Remember how the tab that was just opened came to be, for the step player. */
  const keep = (
    op: ConversionOp,
    source: Automaton | null,
    res: ConvertResponse,
    result: Automaton,
  ) => {
    const id = get().activeTabId
    const record: ConversionRecord = {
      op,
      source,
      result,
      steps: res.steps,
      stateMap: res.stateMap ?? null,
      rounds: res.rounds ?? null,
    }
    set((st) => ({ records: { ...st.records, [id]: record }, player: IDLE_PLAYER }))
  }

  /** Everything that belongs to "what is on the canvas now" and must start fresh on a switch. */
  const fresh = (st: StudioState) => ({
    loadId: st.loadId + 1,
    selection: null,
    flagged: NO_FLAG,
    issues: null,
    prompt: null,
    sim: { ...st.sim, ...IDLE_SIM },
    batch: { ...st.batch, results: null, error: null },
    player: IDLE_PLAYER,
  })

  const saved = loadWorkspace()
  const initialTabs: DocTab[] = saved
    ? saved.tabs.map((t) => ({ id: t.id, doc: ensurePositions(t.doc), projectId: t.projectId }))
    : [{ id: newTabId(), doc: M.emptyAutomaton() }]
  const initialActive = saved?.activeId ?? initialTabs[0].id

  const summary = (op: SingleConversion, before: Automaton, res: ConvertResponse): string => {
    const n = res.automaton.states.length
    if (op === 'remove-epsilon')
      return `${states(before.states.length)} → ${states(n)}, no ε-transitions.`
    if (op === 'nfa-to-dfa')
      return `${before.states.length} NFA states → ${n} DFA state${n === 1 ? '' : 's'}.`
    const merged = Object.values(res.stateMap ?? {}).filter((m) => m.length > 1)
    return (
      `${states(before.states.length)} → ${states(n)}.` +
      (merged.length
        ? ` Merged: ${merged.map((m) => m.join(' + ')).join('; ')}.`
        : ' Already minimal.')
    )
  }

  const failure = (e: unknown, pattern?: string): Partial<ConvertState> =>
    pattern !== undefined && e instanceof ApiError && e.code === 'REGEX_SYNTAX'
      ? { regexError: { message: e.message, position: e.position, pattern }, error: null }
      : { error: describeError(e), regexError: null }

  const CALLS = { 'remove-epsilon': removeEpsilon, 'nfa-to-dfa': nfaToDfa, minimize: minimizeDfa }

  return {
    doc: ensurePositions(initialTabs.find((t) => t.id === initialActive)!.doc),
    tabs: initialTabs,
    activeTabId: initialActive,
    loadId: 0,
    selection: null,
    flagged: NO_FLAG,
    issues: null,
    validationError: null,
    prompt: null,
    sim: { input: '', ...IDLE_SIM },
    batch: { text: '', results: null, running: false, error: null },
    convert: { running: false, regexError: null, error: null, note: null },
    sideTab: 'edit',
    toasts: [],
    history: {},
    projects: { open: false, loading: false, error: null, items: null },
    helpOpen: false,
    records: {},
    player: IDLE_PLAYER,
    compare: { aId: null, bId: null, ...IDLE_COMPARE },

    select: (selection) => set({ selection }),
    addStateAt: (position) => {
      edit(M.addState(get().doc, position))
      const ids = get().doc.states
      set({ selection: { kind: 'state', id: ids[ids.length - 1].id } })
    },
    deleteState: (id) => edit(M.removeState(get().doc, id)),
    deleteEdge: (from, to) => edit(M.removeEdge(get().doc, from, to)),
    moveState: (id, position) => set((st) => ({ doc: M.moveState(st.doc, id, position) })),
    renameState: (id, label) => edit(M.renameState(get().doc, id, label), `label:${id}`),
    toggleAccepting: (id) => edit(M.toggleAccepting(get().doc, id)),
    setStart: (id) => edit(M.setStart(get().doc, id)),
    setKind: (kind) => edit(M.setKind(get().doc, kind)),
    setName: (name) => set((st) => ({ doc: M.setName(st.doc, name), ...withHistory(st, 'name') })),
    setAlphabet: (alphabet) => edit(M.setAlphabet(get().doc, alphabet)),
    addTrapState: () => edit(M.addTrapState(get().doc)),

    openPrompt: (from, to) => set({ prompt: { from, to } }),
    closePrompt: () => set({ prompt: null }),
    applyPrompt: (text) => {
      const { prompt, doc } = get()
      if (!prompt) return null
      const parsed = M.parseSymbols(text, doc.kind)
      if (parsed.error !== null) return parsed.error
      edit(M.setEdgeSymbols(doc, prompt.from, prompt.to, parsed.symbols))
      set({ prompt: null, selection: { kind: 'edge', from: prompt.from, to: prompt.to } })
      return null
    },

    loadDoc: (doc) => {
      set((st) => ({
        doc: ensurePositions(doc),
        loadId: st.loadId + 1,
        selection: null,
        flagged: NO_FLAG,
        issues: null,
        prompt: null,
        sim: { ...st.sim, ...IDLE_SIM },
        batch: { ...st.batch, results: null, error: null },
        player: IDLE_PLAYER,
        history: { ...st.history, [st.activeTabId]: NO_HISTORY },
      }))
    },
    newDoc: () => get().loadDoc(M.emptyAutomaton()),

    openInNewTab: (doc) => {
      if (get().doc.states.length === 0) return get().loadDoc(doc) // reuse a blank tab
      const laidOut = ensurePositions(doc)
      set((st) => {
        const id = newTabId()
        return {
          tabs: [...syncedTabs(st), { id, doc: laidOut }],
          activeTabId: id,
          doc: laidOut,
          ...fresh(st),
        }
      })
    },
    newTab: () => {
      if (get().doc.states.length > 0) get().openInNewTab(M.emptyAutomaton())
    },
    switchTab: (id) =>
      set((st) => {
        if (id === st.activeTabId) return {}
        const tabs = syncedTabs(st)
        const target = tabs.find((t) => t.id === id)
        return target ? { tabs, activeTabId: id, doc: target.doc, ...fresh(st) } : {}
      }),
    closeTab: (id) =>
      set((st) => {
        const tabs = syncedTabs(st)
        const index = tabs.findIndex((t) => t.id === id)
        if (index < 0) return {}
        if (tabs.length === 1) {
          const blank = { id: newTabId(), doc: M.emptyAutomaton() }
          return {
            tabs: [blank],
            activeTabId: blank.id,
            doc: blank.doc,
            records: {},
            compare: { aId: null, bId: null, ...IDLE_COMPARE },
            ...fresh(st),
          }
        }
        const rest = tabs.filter((t) => t.id !== id)
        const { [id]: _gone, ...records } = st.records
        const { [id]: _h, ...history } = st.history
        // A comparison that involved the closed tab no longer means anything.
        const compare =
          st.compare.aId === id || st.compare.bId === id
            ? { aId: null, bId: null, ...IDLE_COMPARE }
            : st.compare
        if (id !== st.activeTabId) return { tabs: rest, records, history, compare }
        const next = rest[Math.min(index, rest.length - 1)]
        return {
          tabs: rest,
          activeTabId: next.id,
          doc: next.doc,
          records,
          history,
          compare,
          ...fresh(st),
        }
      }),

    setSideTab: (sideTab) => set({ sideTab }),
    setHelpOpen: (helpOpen) => set({ helpOpen }),

    beginMove: () => set((st) => withHistory(st)),
    undo: () =>
      set((st) => {
        const h = st.history[st.activeTabId]
        if (!h || h.past.length === 0) return {}
        const previous = h.past[h.past.length - 1]
        lastEdit = null
        return {
          doc: previous,
          history: {
            ...st.history,
            [st.activeTabId]: { past: h.past.slice(0, -1), future: [st.doc, ...h.future] },
          },
          selection: sanitize(st.selection, previous),
          flagged: NO_FLAG,
          prompt: null,
          sim: { ...st.sim, ...IDLE_SIM },
          batch: { ...st.batch, results: null, error: null },
        }
      }),
    redo: () =>
      set((st) => {
        const h = st.history[st.activeTabId]
        if (!h || h.future.length === 0) return {}
        const [next, ...rest] = h.future
        lastEdit = null
        return {
          doc: next,
          history: {
            ...st.history,
            [st.activeTabId]: { past: [...h.past, st.doc].slice(-HISTORY_LIMIT), future: rest },
          },
          selection: sanitize(st.selection, next),
          flagged: NO_FLAG,
          prompt: null,
          sim: { ...st.sim, ...IDLE_SIM },
          batch: { ...st.batch, results: null, error: null },
        }
      }),

    openProjects: () => {
      set((st) => ({ projects: { ...st.projects, open: true } }))
      void get().refreshProjects()
    },
    closeProjects: () => set((st) => ({ projects: { ...st.projects, open: false } })),
    refreshProjects: async () => {
      set((st) => ({ projects: { ...st.projects, loading: true, error: null } }))
      try {
        const items = await listProjects()
        set((st) => ({ projects: { ...st.projects, loading: false, items } }))
      } catch (e) {
        set((st) => ({ projects: { ...st.projects, loading: false, error: describeError(e) } }))
      }
    },
    saveProject: async () => {
      const start = get()
      const doc = start.doc
      const tabId = start.activeTabId
      if (doc.states.length === 0) {
        get().showToast('info', 'Nothing to save yet. Add a state first.')
        return
      }
      const link = (projectId: string | undefined, saved: Automaton | undefined) =>
        set((st) => ({
          tabs: st.tabs.map((t) => (t.id === tabId ? { ...t, projectId, saved } : t)),
        }))
      try {
        const existing = start.tabs.find((t) => t.id === tabId)?.projectId
        let project
        try {
          project = existing ? await updateProject(existing, doc) : await createProject(doc)
        } catch (e) {
          // The project was deleted somewhere else: keep the user's work by saving it anew.
          if (existing && e instanceof ApiError && e.code === 'NOT_FOUND') {
            project = await createProject(doc)
          } else throw e
        }
        link(project.id, doc)
        get().showToast('success', `Saved “${project.name}”.`)
        if (get().projects.open) void get().refreshProjects()
      } catch (e) {
        get().showToast(
          'error',
          `Could not save: ${describeError(e)} Your work is still kept in this browser.`,
        )
      }
    },
    openProject: async (id) => {
      const open = get().tabs.find((t) => t.projectId === id)
      if (open) {
        get().switchTab(open.id)
        get().closeProjects()
        return
      }
      try {
        const project = await getProject(id)
        get().openInNewTab(project.automaton)
        const tabId = get().activeTabId
        const doc = get().doc
        set((st) => ({
          tabs: st.tabs.map((t) => (t.id === tabId ? { ...t, projectId: id, saved: doc } : t)),
        }))
        get().closeProjects()
        get().showToast('success', `Opened “${project.name}”.`)
      } catch (e) {
        get().showToast('error', `Could not open that project: ${describeError(e)}`)
        void get().refreshProjects()
      }
    },
    removeProject: async (id) => {
      try {
        await deleteProject(id)
        // Tabs that were linked to it become ordinary unsaved tabs.
        set((st) => ({
          tabs: st.tabs.map((t) =>
            t.projectId === id ? { ...t, projectId: undefined, saved: undefined } : t,
          ),
        }))
        get().showToast('info', 'Project deleted.')
      } catch (e) {
        get().showToast('error', `Could not delete: ${describeError(e)}`)
      }
      void get().refreshProjects()
    },
    showToast: (kind, message) => {
      const id = ++toastCounter
      set((st) => ({ toasts: [...st.toasts.slice(-3), { id, kind, message }] }))
      // Errors stay longer: they usually need reading twice.
      setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000)
    },
    dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),
    gotoPlayerStep: (n) =>
      set((st) => {
        const record = st.records[st.activeTabId]
        const last = (record?.steps.length ?? 1) - 1
        const index = Math.max(0, Math.min(n, last))
        return { player: { index, playing: st.player.playing && index < last } }
      }),
    setPlayerPlaying: (playing) => set((st) => ({ player: { ...st.player, playing } })),

    setCompareTabs: (aId, bId) => set({ compare: { aId, bId, ...IDLE_COMPARE } }),
    runEquivalence: async (aId, bId) => {
      const st = get()
      const a = docOfTab(st, aId)
      const b = docOfTab(st, bId)
      if (!a || !b) return
      set({ compare: { aId, bId, ...IDLE_COMPARE, running: true } })
      try {
        const result = await checkEquivalence(a, b)
        set((s) => ({ compare: { ...s.compare, running: false, result, checked: { a, b } } }))
      } catch (e) {
        set((s) => ({ compare: { ...s.compare, running: false, error: describeError(e) } }))
      }
    },
    openSideBySide: async () => {
      const { result, checked } = get().compare
      const word = result?.counterexample
      if (word == null || !checked) return
      // An automaton that has never heard of a symbol simply rejects any word containing it.
      const run = async (doc: Automaton): Promise<TraceSide> => {
        const unknown = [...word].find((c) => !doc.alphabet.includes(c))
        return unknown !== undefined
          ? { note: `“${unknown}” is not in this automaton’s alphabet, so it rejects.` }
          : { trace: await simulate(doc, word) }
      }
      try {
        const [a, b] = await Promise.all([run(checked.a), run(checked.b)])
        set((s) => ({
          compare: { ...s.compare, sideBySide: true, traces: { a, b }, step: 0, playing: false },
        }))
      } catch (e) {
        set((s) => ({ compare: { ...s.compare, error: describeError(e) } }))
      }
    },
    closeSideBySide: () =>
      set((st) => ({ compare: { ...st.compare, sideBySide: false, playing: false } })),
    gotoCompareStep: (n) =>
      set((st) => {
        const t = st.compare.traces
        const len = (x?: TraceSide) => (x && 'trace' in x ? x.trace.steps.length : 1)
        const last = Math.max(len(t?.a), len(t?.b)) - 1
        const step = Math.max(0, Math.min(n, last))
        return { compare: { ...st.compare, step, playing: st.compare.playing && step < last } }
      }),
    setComparePlaying: (playing) => set((st) => ({ compare: { ...st.compare, playing } })),

    runConversion: async (op) => {
      const before = get().doc
      set((st) => ({
        convert: { ...st.convert, running: true, error: null, regexError: null, note: null },
      }))
      try {
        const res = await CALLS[op](before)
        const result = relabelResult(op, before, res)
        get().openInNewTab(result)
        keep(op, before, res, result)
        set((st) => ({
          convert: { ...st.convert, running: false, note: summary(op, before, res) },
        }))
        return true
      } catch (e) {
        set((st) => ({ convert: { ...st.convert, running: false, note: null, ...failure(e) } }))
        return false
      }
    },
    buildFromRegex: async (pattern) => {
      set((st) => ({
        convert: { ...st.convert, running: true, error: null, regexError: null, note: null },
      }))
      try {
        const res = await regexToNfa(pattern)
        const result = relabelResult('regex', null, res)
        get().openInNewTab(result)
        keep('regex', null, res, result)
        set((st) => ({
          convert: {
            ...st.convert,
            running: false,
            note: `Built an ε-NFA with ${states(res.automaton.states.length)}.`,
          },
        }))
        return true
      } catch (e) {
        set((st) => ({
          convert: { ...st.convert, running: false, note: null, ...failure(e, pattern) },
        }))
        return false
      }
    },
    runPipeline: async (pattern) => {
      set((st) => ({
        convert: { ...st.convert, running: true, error: null, regexError: null, note: null },
      }))
      try {
        // Each stage opens its own tab, so the user can flip back and compare them.
        // Each stage is fed the previous stage's labelled result, so labels carry through.
        const enfa = await regexToNfa(pattern)
        const enfaDoc = relabelResult('regex', null, enfa)
        get().openInNewTab(enfaDoc)
        keep('regex', null, enfa, enfaDoc)
        const dfa = await nfaToDfa(enfaDoc)
        const dfaDoc = relabelResult('nfa-to-dfa', enfaDoc, dfa)
        get().openInNewTab(dfaDoc)
        keep('nfa-to-dfa', enfaDoc, dfa, dfaDoc)
        const min = await minimizeDfa(dfaDoc)
        const minDoc = relabelResult('minimize', dfaDoc, min)
        get().openInNewTab(minDoc)
        keep('minimize', dfaDoc, min, minDoc)
        const count = (r: ConvertResponse) => r.automaton.states.length
        set((st) => ({
          convert: {
            ...st.convert,
            running: false,
            note: `ε-NFA (${count(enfa)} states) → DFA (${count(dfa)}) → minimal DFA (${count(min)}).`,
          },
        }))
        return true
      } catch (e) {
        set((st) => ({
          convert: { ...st.convert, running: false, note: null, ...failure(e, pattern) },
        }))
        return false
      }
    },

    setIssues: (issues, error = null) => set({ issues, validationError: error }),
    flag: (flagged) => set({ flagged }),

    setSimInput: (input) => set((st) => ({ sim: { ...st.sim, ...IDLE_SIM, input } })),
    runSimulation: async () => {
      const { doc, sim } = get()
      set({ sim: { ...sim, ...IDLE_SIM, running: true } })
      try {
        const trace = await simulate(doc, sim.input)
        // Ignore the answer if the user edited the automaton or input while we waited.
        if (get().doc !== doc || get().sim.input !== sim.input) return
        set((st) => ({ sim: { ...st.sim, ...IDLE_SIM, trace } }))
      } catch (e) {
        if (get().doc !== doc) return
        set((st) => ({ sim: { ...st.sim, ...IDLE_SIM, error: describeError(e) } }))
      }
    },
    gotoStep: (n) =>
      set((st) => {
        const last = (st.sim.trace?.steps.length ?? 1) - 1
        const step = Math.max(0, Math.min(n, last))
        return { sim: { ...st.sim, step, playing: st.sim.playing && step < last } }
      }),
    setPlaying: (playing) => set((st) => ({ sim: { ...st.sim, playing } })),
    resetSimulation: () => set((st) => ({ sim: { ...st.sim, step: 0, playing: false } })),

    setBatchText: (text) => set((st) => ({ batch: { ...st.batch, text } })),
    runBatch: async () => {
      const { doc, batch } = get()
      // One string per line. A blank line is the empty string, which is a valid input.
      const lines = batch.text.split('\n').map((l) => l.replace(/\r$/, ''))
      const inputs = lines.length > 1 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines
      set({ batch: { ...batch, running: true, error: null, results: null } })
      try {
        const res = await simulateBatch(doc, inputs)
        if (get().doc !== doc) return
        set((st) => ({ batch: { ...st.batch, running: false, results: res.results } }))
      } catch (e) {
        if (get().doc !== doc) return
        set((st) => ({ batch: { ...st.batch, running: false, error: describeError(e) } }))
      }
    },
  }
})
