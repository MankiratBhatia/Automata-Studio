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

  return (
    <div
      role="tablist"
      aria-label="Open automata"
      className="flex items-end gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 pt-1 dark:border-slate-700 dark:bg-slate-950"
    >
      {tabs.map((t) => {
        const active = t.id === activeId
        return (
          <div
            key={t.id}
            className={`flex max-w-[17rem] items-center rounded-t-md border border-b-0 text-sm ${
              active
                ? 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900'
                : 'border-transparent text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={title(t.doc.name)}
              aria-label={title(t.doc.name)} // the full name, not the abbreviated text
              onClick={() => switchTab(t.id)}
              className="min-w-0 flex-1 truncate px-3 py-1.5 text-left"
            >
              {abbreviate(title(t.doc.name))}
            </button>
            <button
              type="button"
              aria-label={`Close ${title(t.doc.name)}`}
              onClick={() => closeTab(t.id)}
              className="mr-1 rounded px-1.5 text-slate-400 hover:bg-slate-300/60 hover:text-slate-900 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        aria-label="New tab"
        title="New blank automaton"
        onClick={newTab}
        className="mb-0.5 rounded px-2 py-1 text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
      >
        +
      </button>
    </div>
  )
}
