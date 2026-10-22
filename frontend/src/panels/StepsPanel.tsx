import { groupBorder, groupFill } from '../canvas/groupColor'
import {
  OP_TITLE,
  partitionAt,
  readableStep,
  subsetTable,
  type ConversionRecord,
  type TableRow,
} from '../model/replay'
import { useStudioStore } from '../store/useStudioStore'
import { Playback } from './Playback'
import { useAutoAdvance } from './useAutoAdvance'

const HEADING = 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500'

export function StepsPanel() {
  const record = useStudioStore((s) => s.records[s.activeTabId])
  const player = useStudioStore((s) => s.player)
  const name = useStudioStore((s) => s.doc.name)
  const { gotoPlayerStep, setPlayerPlaying } = useStudioStore.getState()

  useAutoAdvance(player.playing && !!record, () => {
    const st = useStudioStore.getState()
    st.gotoPlayerStep(st.player.index + 1)
  })

  if (!record) {
    return (
      <div className="space-y-2 p-4 text-sm text-slate-500">
        <p>No steps to replay for this tab.</p>
        <p>
          Build an automaton from a regex, or convert one on the <strong>Convert</strong> tab, then
          come back here to watch the algorithm run one step at a time. (Steps are kept for this
          session only, so they are gone after a reload.)
        </p>
      </div>
    )
  }

  const last = record.steps.length - 1
  const index = Math.min(player.index, last)
  const step = readableStep(record, index)

  return (
    <div
      className="space-y-4 p-4 outline-none"
      tabIndex={0}
      aria-label="Step player. Use the left and right arrow keys to step."
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement) return // let the slider use its own arrow keys
        if (e.key === 'ArrowRight') gotoPlayerStep(index + 1)
        else if (e.key === 'ArrowLeft') gotoPlayerStep(index - 1)
      }}
    >
      <section>
        <h3 className={HEADING}>{OP_TITLE[record.op]}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Result: “{name.trim() || 'Untitled'}”
        </p>
      </section>

      <Playback
        step={index}
        last={last}
        playing={player.playing}
        onGoto={gotoPlayerStep}
        onPlay={setPlayerPlaying}
      />

      <section
        aria-live="polite"
        data-testid="step-card"
        className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700"
      >
        <p className="text-xs text-slate-500">
          Step {index} of {last}
        </p>
        <p className="font-medium">{step.title}</p>
        {step.detail && <p className="mt-1 font-mono text-xs leading-relaxed">{step.detail}</p>}
      </section>

      {record.op === 'nfa-to-dfa' && <SubsetTable record={record} index={index} />}
      {record.op === 'minimize' && <Partition record={record} index={index} />}

      <section aria-label="Steps so far">
        <h3 className={HEADING}>Steps so far</h3>
        <ol className="max-h-48 space-y-0.5 overflow-y-auto text-sm">
          {record.steps.slice(0, index + 1).map((s) => (
            <li key={s.index}>
              <button
                type="button"
                aria-current={s.index === index ? 'step' : undefined}
                onClick={() => gotoPlayerStep(s.index)}
                className={`w-full truncate rounded px-2 py-0.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  s.index === index
                    ? 'bg-slate-100 font-medium dark:bg-slate-800'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {s.index}. {readableStep(record, s.index).title}
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function SubsetTable({ record, index }: { record: ConversionRecord; index: number }) {
  const rows = subsetTable(record, index)
  const symbols = record.result.alphabet
  return (
    <section aria-label="Subset construction table">
      <h3 className={HEADING}>DFA built so far</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 pr-2 font-medium">State</th>
              <th className="py-1 pr-2 font-medium">= NFA states</th>
              {symbols.map((c) => (
                <th key={c} className="px-2 py-1 font-mono font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        → marks the start state, * an accepting state. A dot is a move not discovered yet.
      </p>
    </section>
  )
}

function Row({ row }: { row: TableRow }) {
  return (
    <tr className="border-t border-slate-200 dark:border-slate-700">
      <th scope="row" className="whitespace-nowrap py-1 pr-2 text-left font-mono font-semibold">
        {row.isStart ? '→ ' : ''}
        {row.label}
        {row.accepting ? ' *' : ''}
      </th>
      <td className="py-1 pr-2 font-mono text-xs">{'{' + row.members.join(', ') + '}'}</td>
      {row.cells.map((c) => (
        <td
          key={c.symbol}
          data-current={c.current || undefined}
          className={`px-2 py-1 font-mono ${c.current ? 'rounded bg-blue-100 font-semibold dark:bg-blue-900' : ''}`}
        >
          {c.target ?? <span className="text-slate-400">·</span>}
        </td>
      ))}
    </tr>
  )
}

function Partition({ record, index }: { record: ConversionRecord; index: number }) {
  const blocks = partitionAt(record, index)
  const round = record.steps[index].round
  if (!blocks) {
    return (
      <section aria-label="Partition">
        <h3 className={HEADING}>Partition</h3>
        <p className="text-sm text-slate-500">No partition yet: first tidy up the automaton.</p>
      </section>
    )
  }
  return (
    <section aria-label="Partition">
      <h3 className={HEADING}>
        {round === 0 ? 'Initial partition' : `Partition after round ${round}`} · {blocks.length}{' '}
        block
        {blocks.length === 1 ? '' : 's'}
      </h3>
      <ul className="space-y-1.5">
        {blocks.map((b) => (
          <li
            key={b.color}
            data-block={b.color}
            className="flex items-center gap-2 rounded border px-2 py-1 text-sm"
            style={{ backgroundColor: groupFill(b.color), borderColor: groupBorder(b.color) }}
          >
            <span className="font-mono">{'{' + b.states.join(', ') + '}'}</span>
            {b.isNew && (
              <span className="ml-auto rounded bg-slate-900/70 px-1.5 text-xs text-white">new</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        States in one block have behaved identically so far. The canvas uses the same colours.
      </p>
    </section>
  )
}
