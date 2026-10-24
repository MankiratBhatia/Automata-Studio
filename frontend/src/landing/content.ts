import type { Mode } from '../mode.ts'

/**
 * Everything the landing page says. Each claim here describes something the studio really
 * does (and has tests for); if a feature is removed, its line must be removed too.
 */

export const REPO_URL = 'https://github.com/MankiratBhatia/Automata-Studio'
export const ALGORITHMS_URL = `${REPO_URL}/blob/main/docs/ALGORITHMS.md`

export interface MachineCard {
  mode: Mode
  icon: 'fa' | 'pda' | 'tm'
  title: string
  tagline: string
  points: string[]
  cta: string
}

export const MACHINES: MachineCard[] = [
  {
    mode: 'fa',
    icon: 'fa',
    title: 'Finite automata',
    tagline: 'DFA, NFA and ε-NFA',
    points: [
      'Draw states and transitions on a canvas: double-click to add, drag to connect.',
      'Mistakes are flagged as you work, and clicking one shows where it is.',
      'Run one string step by step, or test a whole list at once.',
      'Convert, minimise and compare machines (see below).',
    ],
    cta: 'Open finite automata',
  },
  {
    mode: 'pda',
    icon: 'pda',
    title: 'Pushdown automata',
    tagline: 'Machines with a stack',
    points: [
      'Define states, alphabets and moves in a table, with a diagram that updates as you type.',
      'Nondeterministic: a string is accepted if any computation accepts it.',
      'Accept by final state or by empty stack.',
      'Watch the stack grow and shrink as the input is read.',
    ],
    cta: 'Open pushdown automata',
  },
  {
    mode: 'tm',
    icon: 'tm',
    title: 'Turing machines',
    tagline: 'Machines with a tape',
    points: [
      'Deterministic single-tape machines, with a tape that is unbounded in both directions.',
      'A tape viewer with the head marked, and the tape contents when the machine stops.',
      'A 10,000-step limit, so a machine that never halts cannot freeze the page.',
      'Examples: binary increment, aⁿbⁿcⁿ and palindromes.',
    ],
    cta: 'Open Turing machines',
  },
]

export interface Capability {
  icon: 'build' | 'run' | 'check' | 'steps' | 'compare' | 'save' | 'examples' | 'comfort'
  title: string
  text: string
}

export const CAPABILITIES: Capability[] = [
  {
    icon: 'build',
    title: 'Visual construction',
    text: 'Add states with a double-click, connect them by dragging, and edit symbols in place. Undo and redo, several machines in tabs, and automatic layout for generated machines.',
  },
  {
    icon: 'run',
    title: 'String simulation',
    text: 'Step through a run with the active states highlighted on the diagram, or run a list of strings at once and see accepted, rejected or an error for each.',
  },
  {
    icon: 'check',
    title: 'Validation',
    text: 'Missing start states, nondeterminism in a DFA, unreachable states and more are reported as you draw. An incomplete DFA can be completed with one click.',
  },
  {
    icon: 'steps',
    title: 'Step-by-step algorithms',
    text: 'Replay Thompson’s construction, subset construction and DFA minimisation one step at a time, with the subset table and partition blocks shown as they form.',
  },
  {
    icon: 'compare',
    title: 'Equivalence checking',
    text: 'Ask whether two automata accept the same language. If not, you get a shortest string that tells them apart, and can watch both machines run it.',
  },
  {
    icon: 'save',
    title: 'Save and export',
    text: 'Save projects, or export a machine as JSON, a drawing as PNG or SVG, and a transition table as Markdown or CSV.',
  },
  {
    icon: 'examples',
    title: 'Examples included',
    text: 'A gallery of ready-made machines for every model, from a DFA that spots strings ending in 01 to a Turing machine that adds one to a binary number.',
  },
  {
    icon: 'comfort',
    title: 'Comfortable to use',
    text: 'Keyboard shortcuts, light and dark themes, and controls that work with a screen reader.',
  },
]

export const PIPELINE: { label: string; how: string }[] = [
  { label: 'Regular expression', how: 'Thompson’s construction' },
  { label: 'ε-NFA', how: 'ε-removal' },
  { label: 'NFA', how: 'subset construction' },
  { label: 'DFA', how: 'partition refinement' },
  { label: 'Minimal DFA', how: '' },
]

export const STEPS: { title: string; text: string }[] = [
  {
    title: 'Build or load',
    text: 'Start from an example, draw your own, or turn a regular expression into an automaton.',
  },
  {
    title: 'Check it',
    text: 'Validation points out problems before you run anything.',
  },
  {
    title: 'Run it',
    text: 'Type an input and step through the computation: the active state, the stack, the tape.',
  },
  {
    title: 'Understand it',
    text: 'Replay the algorithms, convert between models, compare two machines, and export what you need.',
  },
]

/**
 * The hero animation: the studio's own "Ends with 01" example reading 1101. Which state is
 * active after each symbol, and which transition (an index into the example's transitions)
 * was just taken. An end-to-end test checks this against the backend's real trace, so the
 * picture can never disagree with the engine.
 */
export const HERO_EXAMPLE_ID = 'dfa_ends_with_01'
export const HERO_INPUT = '1101'
export const HERO_TRACE: { state: string; transition: number | null }[] = [
  { state: 'q0', transition: null },
  { state: 'q0', transition: 1 },
  { state: 'q0', transition: 1 },
  { state: 'q1', transition: 0 },
  { state: 'q2', transition: 3 },
]
