import { useEffect, useState, type ReactNode } from 'react'
import { useMachineStore, validateMachine } from './useMachineStore'

interface Tab {
  id: string
  label: string
  panel: ReactNode
}

/** The layout both machine screens share: a diagram on the left, tabbed panels on the right. */
export function MachineShell({
  kind,
  diagram,
  dock,
  tabs,
}: {
  kind: 'pda' | 'tm'
  diagram: ReactNode
  /** Extra content under the diagram (the Turing machine tape). */
  dock?: ReactNode
  tabs: Tab[]
}) {
  const [tab, setTab] = useState(tabs[0].id)
  const machine = useMachineStore((s) => (kind === 'pda' ? s.pda : s.tm))

  // Check the machine with the backend shortly after every edit.
  useEffect(() => {
    const t = setTimeout(() => void validateMachine(kind), 300)
    return () => clearTimeout(t)
  }, [kind, machine])

  const current = tabs.find((t) => t.id === tab) ?? tabs[0]
  return (
    <div className="flex min-h-0 flex-1">
      <main className="flex min-w-0 flex-1 flex-col" aria-label="Machine diagram">
        <div className="min-h-0 flex-1">{diagram}</div>
        {dock}
      </main>
      <aside
        className="flex w-[24rem] shrink-0 flex-col border-l border-slate-200 dark:border-slate-700"
        aria-label="Side panel"
      >
        <div role="tablist" className="flex border-b border-slate-200 dark:border-slate-700">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`mtab-${t.id}`}
              aria-selected={current.id === t.id}
              aria-controls={`mpanel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`flex-1 border-b-2 px-3 py-2 text-sm font-medium ${
                current.id === t.id
                  ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                  : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`mpanel-${current.id}`}
          aria-labelledby={`mtab-${current.id}`}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          {current.panel}
        </div>
      </aside>
    </div>
  )
}
