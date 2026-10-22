import type { Automaton } from '../api/types'
import {
  ParseError,
  parseAutomaton,
  parseAutomatonValue,
  serializeAutomaton,
} from '../model/serialize'

const WORKSPACE_KEY = 'automata-studio:workspace:v1'
const LEGACY_KEY = 'automata-studio:doc:v1' // Phase 2 saved a single automaton here

export interface SavedTab {
  id: string
  doc: Automaton
  /** The saved project this tab was opened from or last saved as, if any. */
  projectId?: string
}

export interface SavedWorkspace {
  tabs: SavedTab[]
  activeId: string
}

// Storage can be missing or throw (private windows, blocked site data), so never let it break the app.

export function loadWorkspace(): SavedWorkspace | null {
  try {
    const text = localStorage.getItem(WORKSPACE_KEY)
    if (text) {
      const raw: unknown = JSON.parse(text)
      const obj = raw as {
        tabs?: { id?: unknown; doc?: unknown; projectId?: unknown }[]
        activeId?: unknown
      }
      const tabs = (obj.tabs ?? []).flatMap((t) =>
        typeof t.id === 'string'
          ? [
              {
                id: t.id,
                doc: parseAutomatonValue(t.doc),
                ...(typeof t.projectId === 'string' ? { projectId: t.projectId } : {}),
              },
            ]
          : [],
      )
      if (tabs.length > 0) {
        const activeId = tabs.some((t) => t.id === obj.activeId)
          ? (obj.activeId as string)
          : tabs[0].id
        return { tabs, activeId }
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY)
    return legacy ? { tabs: [{ id: 't1', doc: parseAutomaton(legacy) }], activeId: 't1' } : null
  } catch (e) {
    if (!(e instanceof ParseError)) console.warn('Could not read saved work', e)
    return null
  }
}

export function saveWorkspace(ws: SavedWorkspace): void {
  try {
    localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        activeId: ws.activeId,
        tabs: ws.tabs.map((t) => ({
          id: t.id,
          doc: JSON.parse(serializeAutomaton(t.doc)),
          projectId: t.projectId,
        })),
      }),
    )
  } catch (e) {
    console.warn('Could not autosave', e)
  }
}
