import { useEffect, useRef, useState } from 'react'
import { formatSymbol, symbolsOfEdge } from '../model/automaton'
import { useStudioStore } from '../store/useStudioStore'

export function SymbolPrompt() {
  const prompt = useStudioStore((s) => s.prompt)
  if (!prompt) return null
  // Keyed so reopening for another edge starts with fresh text.
  return <PromptDialog key={`${prompt.from}→${prompt.to}`} from={prompt.from} to={prompt.to} />
}

function PromptDialog({ from, to }: { from: string; to: string }) {
  const doc = useStudioStore((s) => s.doc)
  const applyPrompt = useStudioStore((s) => s.applyPrompt)
  const closePrompt = useStudioStore((s) => s.closePrompt)
  const existing = symbolsOfEdge(doc, from, to).map(formatSymbol).join(', ')
  const [text, setText] = useState(existing)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const label = (id: string) => doc.states.find((s) => s.id === id)?.label ?? id
  const submit = () => setError(applyPrompt(text))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && closePrompt()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="symbol-prompt-title"
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl dark:bg-slate-800"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => e.key === 'Escape' && closePrompt()}
      >
        <h2 id="symbol-prompt-title" className="text-base font-semibold">
          Transition {label(from)} → {label(to)}
        </h2>
        <label className="mt-3 block text-sm">
          <span className="text-slate-600 dark:text-slate-300">Symbols</span>
          <input
            ref={input}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            placeholder={doc.kind === 'ENFA' ? 'a, b, ε' : 'a, b'}
            aria-invalid={error !== null}
            aria-describedby="symbol-prompt-hint"
            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono dark:border-slate-600 dark:bg-slate-900"
          />
        </label>
        <p id="symbol-prompt-hint" className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Single characters separated by commas.
          {doc.kind === 'ENFA' ? ' Type ε (or eps) for an epsilon transition.' : ''}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={closePrompt} className="btn">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
