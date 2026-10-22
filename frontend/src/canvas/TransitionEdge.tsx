import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps } from '@xyflow/react'
import { memo } from 'react'
import { useStudioStore } from '../store/useStudioStore'
import type { TransitionEdge as TransitionEdgeType } from './canvasMapping'
import { edgePath, selfLoopPath, type Circle } from './edgeGeometry'

function useCircle(id: string): Circle | null {
  const node = useInternalNode(id)
  if (!node) return null
  const w = node.measured.width ?? 56
  const h = node.measured.height ?? 56
  const { x, y } = node.internals.positionAbsolute
  return { x: x + w / 2, y: y + h / 2, r: Math.min(w, h) / 2 }
}

function TransitionEdgeView({ source, target, data, selected }: EdgeProps<TransitionEdgeType>) {
  const from = useCircle(source)
  const to = useCircle(target)
  const select = useStudioStore((s) => s.select)
  const openPrompt = useStudioStore((s) => s.openPrompt)
  if (!from || !to || !data) return null

  const geo = data.selfLoop ? selfLoopPath(from, data.loopDown) : edgePath(from, to, data.bow)
  const tone = data.flagged ? 'flagged' : data.active ? 'active' : selected ? 'selected' : 'idle'

  return (
    <>
      <BaseEdge
        path={geo.path}
        markerEnd="url(#as-arrow)"
        interactionWidth={22}
        className={`as-edge as-edge-${tone}`}
        style={{ stroke: `var(--edge-${tone})`, strokeWidth: tone === 'idle' ? 1.75 : 2.5 }}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`nodrag nopan as-label as-label-${tone}`}
          style={{ transform: `translate(-50%, -50%) translate(${geo.labelX}px, ${geo.labelY}px)` }}
          title="Click to select, double-click to edit symbols"
          disabled={data.readOnly}
          onClick={() => select({ kind: 'edge', from: data.from, to: data.to })}
          onDoubleClick={() => openPrompt(data.from, data.to)}
        >
          {data.label}
        </button>
      </EdgeLabelRenderer>
    </>
  )
}

export const TransitionEdgeComponent = memo(TransitionEdgeView)
