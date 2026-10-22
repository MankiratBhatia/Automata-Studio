import { ReadOnlyCanvas } from './canvas/ReadOnlyCanvas'
import { replayFor } from './model/replay'
import { useStudioStore } from './store/useStudioStore'

/** The main area while the Steps tab is open: the algorithm's current step, read-only. */
export function ReplayView() {
  const record = useStudioStore((s) => s.records[s.activeTabId])
  const index = useStudioStore((s) => s.player.index)
  const tabId = useStudioStore((s) => s.activeTabId)
  if (!record) return null

  const replay = replayFor(record, index)
  return (
    <div className="flex h-full flex-col" data-testid="replay">
      <p className="border-b border-slate-200 bg-blue-50 px-4 py-1.5 text-sm text-blue-900 dark:border-slate-700 dark:bg-blue-950 dark:text-blue-100">
        <strong>Replay (read-only).</strong> {replay.caption}
      </p>
      <div className="min-h-0 flex-1">
        {/* Keyed so the view re-fits when the replayed automaton changes. */}
        <ReadOnlyCanvas
          key={`${tabId}-${record.op}`}
          doc={replay.doc}
          view={replay.view}
          label={`Replay of ${record.op}`}
        />
      </div>
    </div>
  )
}
