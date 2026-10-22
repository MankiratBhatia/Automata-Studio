import { Handle, Position, type NodeProps } from '@xyflow/react'
import { memo } from 'react'
import type { StateNode as StateNodeType } from './canvasMapping'
import { groupBorder, groupFill } from './groupColor'

function StateNodeView({ data, selected }: NodeProps<StateNodeType>) {
  const blockStyle =
    data.group === null
      ? undefined
      : { backgroundColor: groupFill(data.group), borderColor: groupBorder(data.group) }
  const tone = data.flagged
    ? 'border-red-500 ring-4 ring-red-400/50'
    : data.active
      ? 'border-blue-600 bg-blue-100 ring-4 ring-blue-400/50 dark:bg-blue-900'
      : selected
        ? 'border-slate-900 ring-2 ring-slate-900/30 dark:border-white dark:ring-white/30'
        : 'border-slate-500 dark:border-slate-400'

  return (
    <div
      className={`group relative flex h-14 w-14 items-center justify-center rounded-full border-2 bg-white text-sm font-medium text-slate-900 shadow-sm transition-[box-shadow,opacity] dark:bg-slate-800 dark:text-slate-100 ${tone} ${
        data.ghost ? 'pointer-events-none opacity-0' : ''
      }`}
      data-testid={`state-${data.label}`}
      data-group={data.group ?? undefined}
      style={blockStyle}
    >
      {data.isAccepting && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-[3px] rounded-full border-2 border-current opacity-70"
        />
      )}
      {data.isStart && (
        <svg
          aria-label="start state"
          className="pointer-events-none absolute right-full top-1/2 mr-0.5 h-4 w-9 -translate-y-1/2 text-slate-600 dark:text-slate-300"
          viewBox="0 0 36 16"
        >
          <path d="M0 8 H28" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M24 2 L34 8 L24 14 Z" fill="currentColor" />
        </svg>
      )}
      <span
        title={data.id === data.label ? data.label : `${data.label} = ${data.id}`}
        className={`max-w-[46px] truncate leading-tight ${
          data.label.length <= 3 ? 'text-sm' : data.label.length <= 6 ? 'text-xs' : 'text-[10px]'
        }`}
      >
        {data.label}
      </span>

      {/* Edges are drawn "floating" between circles, so handles only decide where a drag
          starts (the dot) and where it may be dropped (anywhere on the node). */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectableStart={false}
        style={{
          top: '50%',
          left: '50%',
          width: 2,
          height: 2,
          opacity: 0,
          transform: 'translate(-50%,-50%)',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        title="Drag to another state (or back onto this one) to add a transition"
        className="!h-3 !w-3 !border-2 !border-white !bg-blue-600 opacity-0 transition-opacity group-hover:opacity-100 hover:!scale-125 dark:!border-slate-800"
        style={{ right: -7, opacity: selected ? 1 : undefined }}
      />
    </div>
  )
}

export const StateNodeComponent = memo(StateNodeView)
