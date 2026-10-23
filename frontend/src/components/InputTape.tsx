/** The input string as boxes: symbols already read are blue, the next one is outlined. */
export function InputTape({
  input,
  position,
  failed,
}: {
  input: string
  position: number
  failed: boolean
}) {
  if (input === '') {
    return <p className="font-mono text-sm text-slate-600 dark:text-slate-400">Empty input (ε)</p>
  }
  return (
    <div
      className="flex flex-wrap gap-1"
      role="img"
      aria-label={`Input ${input}, ${position} symbols read`}
    >
      {[...input].map((ch, i) => {
        const read = i < position
        const failedHere = failed && i === position - 1
        return (
          <span
            key={i}
            className={`grid h-8 w-8 place-items-center rounded border font-mono text-sm ${
              failedHere
                ? 'border-red-500 bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                : read
                  ? 'border-blue-500 bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100'
                  : i === position
                    ? 'border-slate-900 ring-2 ring-slate-900/40 dark:border-white dark:ring-white/40'
                    : 'border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-400'
            }`}
          >
            {ch}
          </span>
        )
      })}
    </div>
  )
}
