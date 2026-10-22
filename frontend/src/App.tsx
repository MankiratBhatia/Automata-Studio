import { ArrowDefs } from './canvas/ArrowDefs'
import { AutomatonCanvas } from './canvas/AutomatonCanvas'
import { SymbolPrompt } from './canvas/SymbolPrompt'
import { Header } from './Header'
import { HelpDialog } from './HelpDialog'
import { ProjectsDialog } from './ProjectsDialog'
import { useShortcuts } from './shortcuts'
import { TipBar } from './TipBar'
import { ToastHost } from './ToastHost'
import { TabBar } from './TabBar'
import { ComparePane } from './ComparePane'
import { ConvertPanel } from './panels/ConvertPanel'
import { ComparePanel } from './panels/ComparePanel'
import { StepsPanel } from './panels/StepsPanel'
import { ReplayView } from './ReplayView'
import { PropertiesPanel } from './panels/PropertiesPanel'
import { SimulationPanel } from './panels/SimulationPanel'
import { ValidationPanel } from './panels/ValidationPanel'
import { useAutoValidate, useAutosave } from './store/effects'
import { useStudioStore, type SideTab } from './store/useStudioStore'

export default function App() {
  useAutoValidate()
  useAutosave()
  useShortcuts()
  const tab = useStudioStore((s) => s.sideTab)
  const setTab = useStudioStore.getState().setSideTab
  const replaying = useStudioStore((s) => tab === 'steps' && !!s.records[s.activeTabId])
  const comparing = useStudioStore((s) => tab === 'compare' && s.compare.sideBySide)
  const issues = useStudioStore((s) => s.issues)
  const errorCount = issues?.filter((i) => i.severity === 'error').length ?? 0
  const warningCount = (issues?.length ?? 0) - errorCount

  const tabs: { id: SideTab; label: string; badge?: string; badgeTone?: string }[] = [
    { id: 'edit', label: 'Edit' },
    {
      id: 'validate',
      label: 'Validate',
      badge: issues && issues.length > 0 ? String(issues.length) : undefined,
      badgeTone: errorCount
        ? 'bg-red-600 text-white'
        : warningCount
          ? 'bg-amber-400 text-amber-950'
          : '',
    },
    { id: 'simulate', label: 'Simulate' },
    { id: 'convert', label: 'Convert' },
    { id: 'steps', label: 'Steps' },
    { id: 'compare', label: 'Compare' },
  ]

  return (
    <div className="flex h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <ArrowDefs />
      <Header />
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col" aria-label="Automaton canvas">
          <TabBar />
          <TipBar />
          <div className="min-h-0 flex-1">
            {comparing ? <ComparePane /> : replaying ? <ReplayView /> : <AutomatonCanvas />}
          </div>
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
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`flex-1 border-b-2 px-1.5 py-2 text-sm font-medium ${
                  tab === t.id
                    ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                {t.label}
                {t.badge && (
                  <span className={`ml-1.5 rounded-full px-1.5 text-xs ${t.badgeTone}`}>
                    {t.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {tab === 'edit' && <PropertiesPanel />}
            {tab === 'validate' && <ValidationPanel />}
            {tab === 'simulate' && <SimulationPanel />}
            {tab === 'convert' && <ConvertPanel />}
            {tab === 'steps' && <StepsPanel />}
            {tab === 'compare' && <ComparePanel />}
          </div>
        </aside>
      </div>
      <SymbolPrompt />
      <ProjectsDialog />
      <HelpDialog />
      <ToastHost />
    </div>
  )
}
