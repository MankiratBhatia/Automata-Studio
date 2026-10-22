import { formatSymbol, type Automaton } from './automaton'

export type TableFormat = 'markdown' | 'csv'

/** "My DFA (v2)" -> "my-dfa-v2": safe to use in a file name. */
export function fileStem(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'automaton'
  )
}

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s)
const mdCell = (s: string) => s.replaceAll('|', '\\|')

/**
 * The transition table in textbook form: → marks the start state, * an accepting state.
 * A DFA cell holds one state; an NFA cell holds a set, written {q1, q2}, with ∅ for none.
 */
export function transitionTable(doc: Automaton, format: TableFormat): string {
  const label = new Map(doc.states.map((s) => [s.id, s.label]))
  const nameOf = (id: string) => label.get(id) ?? id
  const hasEpsilon = doc.kind === 'ENFA' || doc.transitions.some((t) => t.symbol === null)
  const columns: (string | null)[] = [...doc.alphabet, ...(hasEpsilon ? [null] : [])]
  const deterministic = doc.kind === 'DFA'

  const cell = (from: string, symbol: string | null): string => {
    const targets = doc.transitions
      .filter((t) => t.from === from && t.symbol === symbol)
      .map((t) => nameOf(t.to))
    const unique = [...new Set(targets)]
    if (unique.length === 0) return deterministic ? '—' : '∅'
    return deterministic && unique.length === 1 ? unique[0] : `{${unique.join(', ')}}`
  }

  const header = ['State', ...columns.map(formatSymbol)]
  const rows = doc.states.map((s) => [
    `${doc.start === s.id ? '→' : ''}${doc.accepting.includes(s.id) ? '*' : ''}${doc.start === s.id || doc.accepting.includes(s.id) ? ' ' : ''}${s.label}`,
    ...columns.map((c) => cell(s.id, c)),
  ])

  if (format === 'csv') {
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
  }
  const line = (r: string[]) => `| ${r.map(mdCell).join(' | ')} |`
  return (
    [
      line(header),
      `| ${header.map((_, i) => (i === 0 ? ':--' : ':-:')).join(' | ')} |`,
      ...rows.map(line),
    ].join('\n') + '\n'
  )
}
