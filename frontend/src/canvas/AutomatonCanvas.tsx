import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EXAMPLES } from '../examples'
import { nextFreePosition } from '../model/automaton'
import { NODE_SIZE } from '../model/layout'
import { useTheme } from '../theme'
import { useStudioStore } from '../store/useStudioStore'
import { registerCanvasExporter, renderCanvas } from './exportImage'
import {
  stabilize,
  toFlow,
  type CanvasView,
  type StateNode,
  type TransitionEdge,
} from './canvasMapping'
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
  const flow = useReactFlow()
  const { screenToFlowPosition, fitView } = flow
  const dark = useTheme((s) => s.dark)
  const canUndo = useStudioStore((s) => (s.history[s.activeTabId]?.past.length ?? 0) > 0)
  const canRedo = useStudioStore((s) => (s.history[s.activeTabId]?.future.length ?? 0) > 0)

  // Let the header export this canvas as an image (it lives outside this React Flow provider).
  useEffect(() => {
    registerCanvasExporter((format) => renderCanvas(flow, format, dark ? '#0f172a' : '#f8fafc'))
    return () => registerCanvasExporter(null)
  }, [flow, dark])

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
  // Memory that must outlive a render: elements that did not change keep their identity, so
  // React Flow does not re-measure them (and briefly drop their edges) when something unrelated,
  // like the selection, changes; and the sizes React Flow has measured are handed back on every
  // node object, which tells it "still measured". Plain mutable maps, never rendered themselves.
  const [memo] = useState(() => ({
    nodes: new Map<string, StateNode>(),
    edges: new Map<string, TransitionEdge>(),
    measured: new Map<string, { width: number; height: number }>(),
  }))
  const { nodes, edges } = useMemo(() => {
    const flow = toFlow(doc, view)
    const withSize = flow.nodes.map((n) => {
      const m = memo.measured.get(n.id)
      return m ? { ...n, measured: m } : n
    })
    return {
      nodes: stabilize(withSize, memo.nodes),
      edges: stabilize(flow.edges, memo.edges),
    }
  }, [doc, view, memo])

  // Re-fit the view whenever a whole new automaton is loaded (example, import, new).
  useEffect(() => {
    if (loadId === 0) return
    const t = setTimeout(() => void fitView({ padding: 0.3, duration: 250, maxZoom: 1.25 }), 50)
    return () => clearTimeout(t)
  }, [loadId, fitView])

  const onNodesChange = useCallback(
    (changes: NodeChange<StateNode>[]) => {
      const st = useStudioStore.getState()
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) memo.measured.set(c.id, c.dimensions)
        else if (c.type === 'position' && c.position) st.moveState(c.id, c.position)
        else if (c.type === 'select') {
          const sel = useStudioStore.getState().selection
          if (c.selected) st.select({ kind: 'state', id: c.id })
          else if (sel?.kind === 'state' && sel.id === c.id) st.select(null)
        } else if (c.type === 'remove') st.deleteState(c.id)
      }
    },
    [memo],
  )

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
        onNodeDragStart={() => useStudioStore.getState().beginMove()}
        colorMode={dark ? 'dark' : 'light'}
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
        // Selecting an edge must not move it to a new z-index layer: that re-creates every edge
        // (and its label) in the DOM, which swallows the second click of a double-click.
        elevateEdgesOnSelect={false}
        elevateNodesOnSelect={false}
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
        <Panel position="top-left" className="flex gap-1">
          <button
            type="button"
            className="btn bg-white/90 dark:bg-slate-800/90"
            aria-keyshortcuts="S"
            title="Add a state (S)"
            onClick={() =>
              useStudioStore.getState().addStateAt(nextFreePosition(useStudioStore.getState().doc))
            }
          >
            + State
          </button>
          <button
            type="button"
            className="btn bg-white/90 dark:bg-slate-800/90"
            aria-keyshortcuts="Control+Z Meta+Z"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={() => useStudioStore.getState().undo()}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn bg-white/90 dark:bg-slate-800/90"
            aria-keyshortcuts="Control+Y Meta+Shift+Z"
            title="Redo (Ctrl+Y)"
            disabled={!canRedo}
            onClick={() => useStudioStore.getState().redo()}
          >
            Redo
          </button>
        </Panel>
      </ReactFlow>

      {doc.states.length === 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="pointer-events-auto max-w-sm rounded-xl border border-slate-200 bg-white/90 p-5 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800/90">
            <h2 className="text-base font-semibold">Start an automaton</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Double-click anywhere to add a state, then drag from its blue dot to another state to
              add a transition.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const ex = EXAMPLES.find((e) => e.id === 'dfa_ends_with_01')
                  if (ex) useStudioStore.getState().openInNewTab(ex.automaton)
                }}
              >
                Try an example
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => useStudioStore.getState().setSideTab('convert')}
              >
                Build from a regex
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => useStudioStore.getState().setHelpOpen(true)}
              >
                Keyboard shortcuts
              </button>
            </div>
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
