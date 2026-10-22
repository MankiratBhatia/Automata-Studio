import type { Automaton } from '../api/types'
import { ensurePositions } from '../model/layout'
import { parseAutomaton } from '../model/serialize'

// The example gallery reuses the backend's test fixtures, so the demo and the tests can never drift.
const files = import.meta.glob('../../../backend/tests/fixtures/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export interface Example {
  id: string
  title: string
  automaton: Automaton
}

export const EXAMPLES: Example[] = Object.entries(files)
  .filter(([path]) => !path.endsWith('expectations.json'))
  .map(([path, text]) => {
    const automaton = ensurePositions(parseAutomaton(text))
    return { id: path.split('/').pop()!.replace('.json', ''), title: automaton.name, automaton }
  })
  .sort((a, b) => a.id.localeCompare(b.id))
