import { useState } from 'react'
import { Modal } from './components/Modal'
import { Spinner } from './components/Spinner'
import { useStudioStore } from './store/useStudioStore'

const KIND = { DFA: 'DFA', NFA: 'NFA', ENFA: 'ε-NFA' } as const

export function ProjectsDialog() {
  const projects = useStudioStore((s) => s.projects)
  if (!projects.open) return null
  return <Dialog />
}

function Dialog() {
  const { items, loading, error } = useStudioStore((s) => s.projects)
  const openTabs = useStudioStore((s) => s.tabs)
  const { closeProjects, refreshProjects, saveProject, openProject, removeProject } =
    useStudioStore.getState()
  // Deleting is two clicks: the first arms the row, the second confirms.
  const [armed, setArmed] = useState<string | null>(null)
  const isOpen = (id: string) => openTabs.some((t) => t.projectId === id)

  return (
    <Modal title="My projects" onClose={closeProjects} wide>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Saved on the backend, so they survive closing the browser. Your open tabs are also kept in
        this browser.
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" className="btn btn-primary" onClick={() => void saveProject()}>
          Save current tab
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void refreshProjects()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 min-h-24" aria-live="polite" aria-busy={loading}>
        {loading && !items && (
          <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Spinner /> Loading projects…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
          >
            {error}
          </p>
        )}
        {items && items.length === 0 && !error && (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            No saved projects yet. Draw something and press <strong>Save current tab</strong>.
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.name}
                    {isOpen(p.id) && (
                      <span className="ml-2 rounded bg-blue-100 px-1.5 text-xs font-normal text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                        open
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {KIND[p.kind]} · saved {new Date(p.updatedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Open ${p.name}`}
                  onClick={() => void openProject(p.id)}
                >
                  Open
                </button>
                {armed === p.id ? (
                  <button
                    type="button"
                    className="btn bg-red-600 text-white hover:!bg-red-700"
                    aria-label={`Confirm delete ${p.name}`}
                    onClick={() => {
                      setArmed(null)
                      void removeProject(p.id)
                    }}
                    onBlur={() => setArmed(null)}
                    autoFocus
                  >
                    Confirm delete
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn text-red-700 dark:text-red-400"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setArmed(p.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" className="btn" onClick={closeProjects}>
          Close
        </button>
      </div>
    </Modal>
  )
}
