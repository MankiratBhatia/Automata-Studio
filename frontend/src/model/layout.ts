import dagre from '@dagrejs/dagre'
import type { Automaton } from '../api/types'

export const NODE_SIZE = 56

/** Left-to-right layered layout. Positions are top-left corners, as React Flow expects. */
export function autoLayout(doc: Automaton): Automaton {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 110, marginx: 40, marginy: 40 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const s of doc.states) g.setNode(s.id, { width: NODE_SIZE, height: NODE_SIZE })
  for (const t of doc.transitions) {
    if (t.from !== t.to && g.hasNode(t.from) && g.hasNode(t.to)) g.setEdge(t.from, t.to)
  }
  dagre.layout(g)
  return {
    ...doc,
    states: doc.states.map((s) => {
      const n = g.node(s.id)
      return {
        ...s,
        position: { x: Math.round(n.x - NODE_SIZE / 2), y: Math.round(n.y - NODE_SIZE / 2) },
      }
    }),
  }
}

/** Lay out the automaton only if some state has no position yet (e.g. generated or imported). */
export function ensurePositions(doc: Automaton): Automaton {
  return doc.states.every((s) => s.position) ? doc : autoLayout(doc)
}
