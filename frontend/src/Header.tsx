import { useRef } from 'react'
import { useBackendStatus } from './api/useBackendStatus'
import { EXAMPLES } from './examples'
import { ExportMenu } from './ExportMenu'
import { MachineToolbar } from './machines/MachineToolbar'
import { useMode } from './mode'
import { hrefFor } from './route'
import { ModeSwitch } from './ModeSwitch'
import { ParseError, parseAutomaton } from './model/serialize'
import { useStudioStore } from './store/useStudioStore'
import { useTheme, type ThemePref } from './theme'

const DOT: Record<string, string> = {
  checking: 'bg-amber-400',
  connected: 'bg-emerald-500',
  offline: 'bg-red-500',
}

export function Header() {
  const status = useBackendStatus()
  const fileInput = useRef<HTMLInputElement>(null)
  const mode = useMode((s) => s.mode)
  const pref = useTheme((s) => s.pref)
  const setPref = useTheme((s) => s.setPref)

  const onImport = async (file: File) => {
    const st = useStudioStore.getState()
    try {
      st.openInNewTab(parseAutomaton(await file.text()))
    } catch (e) {
      st.showToast(
        'error',
        e instanceof ParseError
          ? `Could not import ${file.name}: ${e.message}`
          : 'Could not read that file.',
      )
    }
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <h1 className="text-lg font-semibold">
          <a
            href={hrefFor('home')}
            title="Back to the home page"
            className="rounded hover:text-blue-700 dark:hover:text-blue-300"
          >
            Automata Studio
          </a>
        </h1>
        <ModeSwitch />

        {mode !== 'fa' && <MachineToolbar kind={mode} />}
        {mode === 'fa' && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Load example"
              value=""
              onChange={(e) => {
                const ex = EXAMPLES.find((x) => x.id === e.target.value)
                if (ex) useStudioStore.getState().openInNewTab(ex.automaton)
              }}
              className="btn w-44 dark:bg-slate-900"
            >
              <option value="">Examples…</option>
              {EXAMPLES.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn"
              onClick={() => useStudioStore.getState().newTab()}
            >
              New
            </button>
            <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
              Import
            </button>
            <ExportMenu />
            <span
              className="mx-1 hidden h-5 w-px bg-slate-300 sm:inline-block dark:bg-slate-600"
              aria-hidden
            />
            <button
              type="button"
              className="btn"
              onClick={() => useStudioStore.getState().openProjects()}
            >
              Projects
            </button>
            <button
              type="button"
              className="btn"
              aria-keyshortcuts="Control+S Meta+S"
              title="Save this tab as a project (Ctrl+S)"
              onClick={() => void useStudioStore.getState().saveProject()}
            >
              Save
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              aria-label="Import automaton file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = '' // allow re-importing the same file
                if (file) void onImport(file)
              }}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-sm">
          <select
            aria-label="Theme"
            value={pref}
            onChange={(e) => setPref(e.target.value as ThemePref)}
            className="btn dark:bg-slate-900"
          >
            <option value="system">Theme: System</option>
            <option value="light">Theme: Light</option>
            <option value="dark">Theme: Dark</option>
          </select>
          <button
            type="button"
            className="btn"
            aria-label="Keyboard shortcuts"
            aria-keyshortcuts="?"
            title="Keyboard shortcuts (?)"
            onClick={() => useStudioStore.getState().setHelpOpen(true)}
          >
            ?
          </button>
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <span className={`h-2.5 w-2.5 rounded-full ${DOT[status.state]}`} aria-hidden />
            <span>
              {status.state === 'checking' && 'Connecting…'}
              {status.state === 'connected' && `Backend connected (v${status.version})`}
              {status.state === 'offline' && 'Backend offline'}
            </span>
          </div>
        </div>
      </div>
    </header>
  )
}
