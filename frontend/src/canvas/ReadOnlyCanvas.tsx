import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useMemo } from 'react'
import type { Automaton } from '../model/automaton'
import { useTheme } from '../theme'
import { NO_VIEW, toFlow, type CanvasView } from './canvasMapping'
import { StateNodeComponent } from './StateNode'
import { TransitionEdgeComponent } from './TransitionEdge'

const nodeTypes = { state: StateNodeComponent }
const edgeTypes = { transition: TransitionEdgeComponent }

interface Props {
  doc: Automaton
  /** What to emphasise: active states and transitions, partition colours, what is built yet. */
  view?: Partial<CanvasView>
  label: string
  /**
   * Pan, zoom and the zoom buttons. Turn off for a picture that sits inside a scrolling page,
   * so the mouse wheel scrolls the page instead of being captured by the diagram.
   */
  interactive?: boolean
}

/**
 * A canvas that only displays. Used for step replays and for the side-by-side comparison.
 * Remount it (via `key`) to re-fit the view when `doc` is replaced.
 */
export function ReadOnlyCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  )
}

function Inner({ doc, view, label, interactive = true }: Props) {
  const dark = useTheme((s) => s.dark)
  const { nodes, edges } = useMemo(
    () => toFlow(doc, { ...NO_VIEW, ...view, readOnly: true }),
    [doc, view],
  )
  return (
    <div className="h-full w-full" role="group" aria-label={label} data-testid="readonly-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={dark ? 'dark' : 'light'}
        panOnDrag={interactive}
        zoomOnScroll={interactive}
        zoomOnPinch={interactive}
        zoomOnDoubleClick={interactive}
        preventScrolling={interactive}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        deleteKeyCode={null}
        minZoom={0.3}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.25 }}
      >
        <Background gap={20} />
        {interactive && <Controls showInteractive={false} />}
      </ReactFlow>
    </div>
  )
}
