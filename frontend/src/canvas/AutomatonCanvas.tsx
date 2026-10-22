import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo } from 'react'
import { NODE_SIZE } from '../model/layout'
import { useStudioStore } from '../store/useStudioStore'
import { toFlow, type CanvasView, type StateNode, type TransitionEdge } from './canvasMapping'
import { StateNodeComponent } from './StateNode'
import { TransitionEdgeComponent } from './TransitionEdge'

const nodeTypes = { state: StateNodeComponent }
const edgeTypes = { transition: TransitionEdgeComponent }

function Canvas() {
  const doc = useStudioStore((s) => s.doc)
  const selection = useStudioStore((s) => s.selection)
  const flagged = useStudioStore((s) => s.flagged)
  const trace = useStudioStore((s) => s.sim.trace)
  const step = useStudioStore((s) => s.sim.step)
  const loadId = useStudioStore((s) => s.loadId)
  const { screenToFlowPosition, fitView } = useReactFlow()

  const current = trace?.steps[step]
  const view: CanvasView = useMemo(
    () => ({
      selection,
      activeStates: new Set(current?.states ?? []),
      activeTransitions: new Set(current?.transitions ?? []),
      flaggedStates: new Set(flagged.states),
      flaggedTransitions: new Set(flagged.transitions),
    }),
    [selection, current, flagged],
  )
  const { nodes, edges } = useMemo(() => toFlow(doc, view), [doc, view])

  // Re-fit the view whenever a whole new automaton is loaded (example, import, new).
  useEffect(() => {
    if (loadId === 0) return
    const t = setTimeout(() => void fitView({ padding: 0.3, duration: 250, maxZoom: 1.25 }), 50)
    return () => clearTimeout(t)
  }, [loadId, fitView])

  const onNodesChange = useCallback((changes: NodeChange<StateNode>[]) => {
    const st = useStudioStore.getState()
    for (const c of changes) {
      if (c.type === 'position' && c.position) st.moveState(c.id, c.position)
      else if (c.type === 'select') {
        const sel = useStudioStore.getState().selection
        if (c.selected) st.select({ kind: 'state', id: c.id })
        else if (sel?.kind === 'state' && sel.id === c.id) st.select(null)
      } else if (c.type === 'remove') st.deleteState(c.id)
    }
  }, [])

  const onEdgesChange = useCallback(
    (changes: EdgeChange<TransitionEdge>[]) => {
      const st = useStudioStore.getState()
      const find = (id: string) => edges.find((e) => e.id === id)?.data
      for (const c of changes) {
        if (c.type !== 'remove' && c.type !== 'select') continue
        const d = find(c.id)
        if (!d) continue
        if (c.type === 'remove') st.deleteEdge(d.from, d.to)
        else if (c.selected) st.select({ kind: 'edge', from: d.from, to: d.to })
        else {
          const sel = useStudioStore.getState().selection
          if (sel?.kind === 'edge' && sel.from === d.from && sel.to === d.to) st.select(null)
        }
      }
    },
    [edges],
  )

  return (
    <div className="relative h-full w-full" data-testid="canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(c) => useStudioStore.getState().openPrompt(c.source, c.target)}
        onPaneClick={(e) => {
          const st = useStudioStore.getState()
          if (e.detail >= 2) {
            const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
            st.addStateAt({
              x: Math.round(p.x - NODE_SIZE / 2),
              y: Math.round(p.y - NODE_SIZE / 2),
            })
          } else st.select(null)
        }}
        onEdgeDoubleClick={(_, edge) => {
          if (edge.data) useStudioStore.getState().openPrompt(edge.data.from, edge.data.to)
        }}
        connectionRadius={48}
        zoomOnDoubleClick={false}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={null}
        selectionKeyCode={null}
        minZoom={0.3}
        maxZoom={2}
        // No `fitView` prop: it would re-fit as soon as the first state is added, moving the
        // canvas out from under the user. We fit on first open and when a whole automaton loads.
        onInit={() => {
          if (useStudioStore.getState().doc.states.length > 0) {
            void fitView({ padding: 0.3, maxZoom: 1.25 })
          }
        }}
      >
        <Background gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>

      {doc.states.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="max-w-xs text-center text-slate-500">
            <p className="text-base font-medium">Double-click anywhere to add a state</p>
            <p className="mt-1 text-sm">
              Then drag from a state’s blue dot to another state to add a transition. Or load an
              example from the header.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export function AutomatonCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  )
}
