import { useMemo } from 'react'
import { ReadOnlyCanvas } from '../canvas/ReadOnlyCanvas'
import { autoLayout } from '../model/layout'
import type { Diagram } from '../model/machines'

interface Props {
  diagram: Diagram
  /** The state the machine is in right now, if a run is being replayed. */
  activeState?: string
  /** The machine transition just taken (an index into the machine's own transitions). */
  activeTransition?: number | null
  label: string
}

/** A machine drawn as a state diagram: read-only, laid out automatically, redrawn as it is edited. */
export function MachineDiagram({ diagram, activeState, activeTransition, label }: Props) {
  // Position states only when the *shape* changes, so editing a symbol does not reshuffle them.
  const shape = JSON.stringify([
    diagram.doc.states.map((s) => s.id),
    diagram.doc.transitions.map((t) => [t.from, t.to]),
  ])
  const laidOut = useMemo(() => autoLayout(diagram.doc), [diagram.doc])
  const view = useMemo(() => {
    const edge = activeTransition == null ? -1 : (diagram.edgeOf[activeTransition] ?? -1)
    return {
      activeStates: new Set(activeState ? [activeState] : []),
      activeTransitions: new Set(edge >= 0 ? [edge] : []),
    }
  }, [activeState, activeTransition, diagram.edgeOf])

  if (diagram.doc.states.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-slate-600 dark:text-slate-400">
        <p>No states yet. Add one in the Machine tab, or load an example.</p>
      </div>
    )
  }
  return <ReadOnlyCanvas key={shape} doc={laidOut} view={view} label={label} />
}
