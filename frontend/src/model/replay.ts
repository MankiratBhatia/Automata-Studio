import type { Step } from '../api/types'
import type { CanvasView } from '../canvas/canvasMapping'
import type { Automaton } from './automaton'
import type { ConversionOp } from './labels'

/** Everything the step player needs about one finished conversion. */
export interface ConversionRecord {
  op: ConversionOp
  /** The automaton the conversion produced (the tab that was opened). */
  result: Automaton
  /** The conversion's input, as it was; null for regex, which has no input automaton. */
  source: Automaton | null
  steps: Step[]
  stateMap: Record<string, string[]> | null
  rounds: string[][][] | null
}

export const OP_TITLE: Record<ConversionOp, string> = {
  regex: "Thompson's construction",
  'remove-epsilon': 'ε-removal',
  'nfa-to-dfa': 'Subset construction',
  minimize: 'DFA minimisation (partition refinement)',
}

const clamp = (record: ConversionRecord, index: number) =>
  Math.max(0, Math.min(index, record.steps.length - 1))

/** The result's states and transitions that exist after running steps 0..index. */
export function builtAt(record: ConversionRecord, index: number) {
  const states = new Set<string>()
  const transitions = new Set<number>()
  for (const s of record.steps.slice(0, clamp(record, index) + 1)) {
    s.addsStates.forEach((x) => states.add(x))
    s.addsTransitions.forEach((x) => transitions.add(x))
  }
  return { states, transitions }
}

export interface Replay {
  /** Which automaton the canvas shows while replaying. */
  doc: Automaton
  view: Partial<CanvasView>
  caption: string
}

/** Block number of each state in partition `round` (the same numbers colour the canvas). */
export function groupsAt(record: ConversionRecord, round: number): Map<string, number> {
  const groups = new Map<string, number>()
  record.rounds?.[round]?.forEach((block, i) => block.forEach((s) => groups.set(s, i)))
  return groups
}

export function replayFor(record: ConversionRecord, index: number): Replay {
  const step = record.steps[clamp(record, index)]
  const active = {
    activeStates: new Set(step.states),
    activeTransitions: new Set(step.transitions),
  }

  if (record.op === 'regex') {
    // No input automaton: show the result growing, with the fragment just built highlighted.
    const b = builtAt(record, index)
    return {
      doc: record.result,
      view: { ...active, builtStates: b.states, builtTransitions: b.transitions },
      caption: 'Building the ε-NFA. Parts that are not built yet are hidden.',
    }
  }

  const source = record.source!
  if (record.op === 'minimize') {
    return {
      doc: source,
      view: {
        ...active,
        groups: step.round == null ? undefined : groupsAt(record, step.round),
      },
      caption: 'The automaton being minimised. States of one colour are not yet told apart.',
    }
  }
  return {
    doc: source,
    view: active,
    caption:
      record.op === 'nfa-to-dfa'
        ? 'The NFA being read. Highlighted: the states and transitions this step looks at.'
        : 'The automaton being converted. Highlighted: the states this step is working on.',
  }
}

// --- subset construction table ----------------------------------------------------------

export interface TableCell {
  symbol: string
  /** Label of the DFA state this move leads to; null until the step that discovers it. */
  target: string | null
  /** True for the move the current step is making. */
  current: boolean
}

export interface TableRow {
  id: string
  label: string
  /** Labels of the NFA states this DFA state stands for. */
  members: string[]
  isStart: boolean
  accepting: boolean
  cells: TableCell[]
}

/** The classic subset-construction table, filled in as far as step `index`. */
export function subsetTable(record: ConversionRecord, index: number): TableRow[] {
  const { states, transitions } = builtAt(record, index)
  const current = new Set(record.steps[clamp(record, index)].addsTransitions)
  const { result, source } = record
  const label = new Map(result.states.map((s) => [s.id, s.label]))
  const sourceLabel = new Map(source?.states.map((s) => [s.id, s.label]))

  return result.states
    .filter((s) => states.has(s.id))
    .map((s) => ({
      id: s.id,
      label: s.label,
      members: (record.stateMap?.[s.id] ?? []).map((m) => sourceLabel.get(m) ?? m),
      isStart: result.start === s.id,
      accepting: result.accepting.includes(s.id),
      cells: result.alphabet.map((symbol) => {
        const i = result.transitions.findIndex((t) => t.from === s.id && t.symbol === symbol)
        const t = i >= 0 && transitions.has(i) ? result.transitions[i] : null
        return {
          symbol,
          target: t ? (label.get(t.to) ?? t.to) : null,
          current: i >= 0 && current.has(i),
        }
      }),
    }))
}

// --- minimisation partitions ------------------------------------------------------------

export interface Block {
  /** Labels of the states in this block. */
  states: string[]
  /** Same number the canvas uses for this block's colour. */
  color: number
  /** True if this block did not exist in the previous round (it was just split off). */
  isNew: boolean
}

/** The partition shown at step `index`, or null for steps before any partition exists. */
export function partitionAt(record: ConversionRecord, index: number): Block[] | null {
  const round = record.steps[clamp(record, index)].round ?? null
  if (round === null || !record.rounds) return null
  const labelOf = new Map(record.source?.states.map((s) => [s.id, s.label]))
  const previous = new Set((record.rounds[round - 1] ?? []).map((b) => b.join('\u0000')))
  return record.rounds[round].map((block, color) => ({
    states: block.map((s) => labelOf.get(s) ?? s),
    color,
    isNew: round > 0 && !previous.has(block.join('\u0000')),
  }))
}

// --- readable step text -----------------------------------------------------------------

/**
 * The backend writes steps in terms of state *ids* (`{q0,q1}`); the diagram shows *labels*
 * (`B`). Swap them so the explanation matches what is on screen. Only ids that differ from
 * their label are touched, and longer ids go first so one id never clobbers part of another.
 */
export function friendlyText(record: ConversionRecord, text: string): string {
  const states = record.op === 'nfa-to-dfa' ? record.result.states : (record.source?.states ?? [])
  const renames = states.filter((s) => s.id !== s.label).sort((a, b) => b.id.length - a.id.length)
  return renames.reduce((out, s) => out.split(s.id).join(s.label), text)
}

export interface ReadableStep {
  title: string
  detail: string
}

export function readableStep(record: ConversionRecord, index: number): ReadableStep {
  const step = record.steps[clamp(record, index)]
  return { title: friendlyText(record, step.title), detail: friendlyText(record, step.detail) }
}
