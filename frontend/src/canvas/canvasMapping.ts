import type { Edge, Node } from '@xyflow/react'
import type { Automaton } from '../model/automaton'
import { edgeLabel, groupTransitions } from '../model/automaton'
import { NODE_SIZE } from '../model/layout'
import { BIDIRECTIONAL_BOW, bowAround, type Circle } from './edgeGeometry'

export interface StateNodeData extends Record<string, unknown> {
  label: string
  /** Internal id; shown in the tooltip when it differs from the label. */
  id: string
  isStart: boolean
  isAccepting: boolean
  active: boolean
  flagged: boolean
  /** Not built yet (step player): drawn invisibly so the layout stays put. */
  ghost: boolean
  /** Block of a partition (minimisation player); states in one block share a colour. */
  group: number | null
}

export interface TransitionEdgeData extends Record<string, unknown> {
  label: string
  /** Sideways curve of the edge; non-zero when the reverse edge exists. */
  bow: number
  selfLoop: boolean
  /** Draw a self-loop below the state instead of above it. */
  loopDown: boolean
  active: boolean
  flagged: boolean
  /** True on read-only canvases: the label does nothing when clicked. */
  readOnly: boolean
  from: string
  to: string
}

export type StateNode = Node<StateNodeData, 'state'>
export type TransitionEdge = Edge<TransitionEdgeData, 'transition'>

/** What the canvas should emphasise on top of the plain automaton. */
export interface CanvasView {
  selection: { kind: 'state'; id: string } | { kind: 'edge'; from: string; to: string } | null
  activeStates: ReadonlySet<string>
  activeTransitions: ReadonlySet<number>
  flaggedStates: ReadonlySet<string>
  flaggedTransitions: ReadonlySet<number>
  /** Step player: if set, only these states / transitions exist yet. Unset means all. */
  builtStates?: ReadonlySet<string>
  builtTransitions?: ReadonlySet<number>
  /** Step player: state id -> partition block number, for colouring. */
  groups?: ReadonlyMap<string, number>
  readOnly?: boolean
}

export const NO_VIEW: CanvasView = {
  selection: null,
  activeStates: new Set(),
  activeTransitions: new Set(),
  flaggedStates: new Set(),
  flaggedTransitions: new Set(),
}

export const edgeId = (from: string, to: string) => `${from}→${to}`

export function toFlow(
  doc: Automaton,
  view: CanvasView = NO_VIEW,
): { nodes: StateNode[]; edges: TransitionEdge[] } {
  const sel = view.selection
  const accepting = new Set(doc.accepting)
  const ids = new Set(doc.states.map((s) => s.id))

  const nodes: StateNode[] = doc.states.map((s) => ({
    id: s.id,
    type: 'state',
    position: s.position ?? { x: 0, y: 0 },
    selected: sel?.kind === 'state' && sel.id === s.id,
    data: {
      label: s.label,
      id: s.id,
      isStart: doc.start === s.id,
      isAccepting: accepting.has(s.id),
      active: view.activeStates.has(s.id),
      flagged: view.flaggedStates.has(s.id),
      ghost: view.builtStates ? !view.builtStates.has(s.id) : false,
      group: view.groups?.get(s.id) ?? null,
    },
  }))

  const centre = new Map<string, Circle>(
    doc.states.map((s) => [
      s.id,
      {
        x: (s.position?.x ?? 0) + NODE_SIZE / 2,
        y: (s.position?.y ?? 0) + NODE_SIZE / 2,
        r: NODE_SIZE / 2,
      },
    ]),
  )

  // Keep only transitions that exist yet; an edge whose every symbol is still unbuilt is
  // not drawn, and a half-built edge shows only the symbols built so far.
  const built = view.builtTransitions
  const groups = groupTransitions(doc)
    .filter((g) => ids.has(g.from) && ids.has(g.to))
    .map((g) => {
      if (!built) return g
      const keep = g.indices.map((_, k) => k).filter((k) => built.has(g.indices[k]))
      return {
        ...g,
        indices: keep.map((k) => g.indices[k]),
        symbols: keep.map((k) => g.symbols[k]),
      }
    })
    .filter((g) => g.indices.length > 0)
  const pairs = new Set(groups.map((g) => edgeId(g.from, g.to)))

  /** A self-loop points away from the side where the state's other edges leave. */
  const loopDown = (id: string): boolean => {
    const me = centre.get(id)!
    let up = 0
    for (const g of groups) {
      const other = g.from === id ? g.to : g.to === id ? g.from : null
      const o = other && other !== id ? centre.get(other) : undefined
      if (o) up += Math.sign(me.y - o.y) * Math.min(1, Math.abs(me.y - o.y) / 40)
    }
    // `up > 0`: neighbours sit above, so the loop goes below.
    return up > 0.25
  }

  const bowFor = (g: (typeof groups)[number]): number => {
    if (g.from === g.to) return 0
    if (pairs.has(edgeId(g.to, g.from))) return BIDIRECTIONAL_BOW
    const blockers = [...centre].filter(([id]) => id !== g.from && id !== g.to).map(([, c]) => c)
    return bowAround(centre.get(g.from)!, centre.get(g.to)!, blockers)
  }

  const edges: TransitionEdge[] = groups.map((g) => ({
    id: edgeId(g.from, g.to),
    source: g.from,
    target: g.to,
    type: 'transition',
    selected: sel?.kind === 'edge' && sel.from === g.from && sel.to === g.to,
    data: {
      label: edgeLabel(g),
      bow: bowFor(g),
      selfLoop: g.from === g.to,
      loopDown: g.from === g.to && loopDown(g.from),
      active: g.indices.some((i) => view.activeTransitions.has(i)),
      flagged: g.indices.some((i) => view.flaggedTransitions.has(i)),
      readOnly: view.readOnly ?? false,
      from: g.from,
      to: g.to,
    },
  }))

  return { nodes, edges }
}
