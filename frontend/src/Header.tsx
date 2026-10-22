import { useRef, useState } from 'react'
import { useBackendStatus } from './api/useBackendStatus'
import { EXAMPLES } from './examples'
import { ParseError, parseAutomaton, serializeAutomaton } from './model/serialize'
import { useStudioStore } from './store/useStudioStore'

const DOT: Record<string, string> = {
  checking: 'bg-amber-400',
  connected: 'bg-emerald-500',
  offline: 'bg-red-500',
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function Header() {
  const status = useBackendStatus()
  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const onExport = () => {
    const doc = useStudioStore.getState().doc
    const slug = doc.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    download(`${slug || 'automaton'}.json`, serializeAutomaton(doc))
  }

  const onImport = async (file: File) => {
    try {
      useStudioStore.getState().openInNewTab(parseAutomaton(await file.text()))
      setNotice(null)
    } catch (e) {
      setNotice(
        e instanceof ParseError
          ? `Could not import ${file.name}: ${e.message}`
          : 'Could not read that file.',
      )
    }
  }

  return (
    <header className="border-b border-slate-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <h1 className="text-lg font-semibold">Automata Studio</h1>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Load example"
            value=""
            onChange={(e) => {
              const ex = EXAMPLES.find((x) => x.id === e.target.value)
              if (ex) useStudioStore.getState().openInNewTab(ex.automaton)
            }}
            className="btn dark:bg-slate-900"
          >
            <option value="">Examples…</option>
            {EXAMPLES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => useStudioStore.getState().newTab()}>
            New
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button type="button" className="btn" onClick={onExport}>
            Export
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

        <div className="ml-auto flex items-center gap-2 text-sm" role="status" aria-live="polite">
          <span className={`h-2.5 w-2.5 rounded-full ${DOT[status.state]}`} aria-hidden />
          <span>
            {status.state === 'checking' && 'Connecting…'}
            {status.state === 'connected' && `Backend connected (v${status.version})`}
            {status.state === 'offline' && 'Backend offline'}
          </span>
        </div>
      </div>

      {notice && (
        <p
          role="alert"
          className="flex items-center justify-between gap-4 bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {notice}
          <button type="button" className="underline" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}
    </header>
  )
}
