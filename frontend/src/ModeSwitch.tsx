import { MODES, useMode } from './mode'

/** Choose which kind of machine to work with. */
export function ModeSwitch() {
  const mode = useMode((s) => s.mode)
  const setMode = useMode((s) => s.setMode)
  return (
    <nav
      aria-label="Kind of machine"
      className="flex rounded-md border border-slate-300 p-0.5 dark:border-slate-600"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-current={mode === m.id ? 'true' : undefined}
          onClick={() => setMode(m.id)}
          className={`rounded px-2.5 py-1 text-sm font-medium ${
            mode === m.id
              ? 'bg-blue-600 text-white'
              : 'text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
        >
          {m.label}
        </button>
      ))}
    </nav>
  )
}
