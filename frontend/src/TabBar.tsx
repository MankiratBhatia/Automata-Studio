import { useMemo } from 'react'
import { abbreviate } from './model/labels'
import { selectWorkspace, useStudioStore } from './store/useStudioStore'

/** One tab per open automaton: conversions open their results here. */
export function TabBar() {
  // Select the raw pieces: a selector that builds a new array each call would re-render forever.
  const storedTabs = useStudioStore((s) => s.tabs)
  const doc = useStudioStore((s) => s.doc)
  const activeId = useStudioStore((s) => s.activeTabId)
  const tabs = useMemo(
    () => selectWorkspace({ tabs: storedTabs, doc, activeTabId: activeId }).tabs,
    [storedTabs, doc, activeId],
  )
  const { switchTab, closeTab, newTab } = useStudioStore.getState()
  const title = (name: string) => name.trim() || 'Untitled'
  // A tab linked to a saved project is "dirty" once its document differs from the saved one.
  const dirty = (t: { doc: unknown; saved?: unknown; projectId?: string }) =>
    !!t.projectId && t.saved !== undefined && t.doc !== t.saved

  return (
    <nav
      aria-label="Open automata"
      className="flex items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 pt-1 dark:border-slate-700 dark:bg-slate-950"
    >
      <ul className="flex items-end gap-1">
        {tabs.map((t) => {
          const active = t.id === activeId
          const full = `${title(t.doc.name)}${dirty(t) ? ' (unsaved changes)' : ''}`
          return (
            <li
              key={t.id}
              className={`flex max-w-[17rem] items-center rounded-t-md border border-b-0 text-sm ${
                active
                  ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                  : 'border-transparent text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                title={title(t.doc.name)}
                onClick={() => switchTab(t.id)}
                className="min-w-0 flex-1 truncate px-3 py-1.5 text-left"
              >
                {/* Long names are shortened for the eye (keeping the telling end), while
                    assistive technology gets the full name. */}
                <span aria-hidden>{abbreviate(title(t.doc.name))}</span>
                <span className="sr-only">{full}</span>
                {dirty(t) && (
                  <span aria-hidden className="ml-1 text-blue-600 dark:text-blue-400">
                    ●
                  </span>
                )}
              </button>
              <button
                type="button"
                aria-label={`Close ${title(t.doc.name)}`}
                onClick={() => closeTab(t.id)}
                className="mr-1 grid h-6 w-6 place-items-center rounded text-slate-600 hover:bg-slate-300/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        aria-label="New tab"
        title="New blank automaton"
        onClick={newTab}
        className="mb-0.5 rounded px-2 py-1 text-slate-600 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        +
      </button>
    </nav>
  )
}
