import type { Pda, Tm } from '../api/types'
import { parsePda, parseTm } from '../model/machineFiles'

// The same machines the backend tests use, so the gallery, the tests and the E2E tests agree.
const files = import.meta.glob('../../../backend/tests/fixtures/machines/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export interface Example<M> {
  id: string
  title: string
  machine: M
}

const named = (prefix: string) =>
  Object.entries(files)
    .map(([path, text]) => ({ id: path.split('/').pop()!.replace('.json', ''), text }))
    .filter((f) => f.id.startsWith(prefix))
    .sort((a, b) => a.id.localeCompare(b.id))

export const PDA_EXAMPLES: Example<Pda>[] = named('pda_').map(({ id, text }) => {
  const machine = parsePda(text)
  return { id, title: machine.name, machine }
})

export const TM_EXAMPLES: Example<Tm>[] = named('tm_').map(({ id, text }) => {
  const machine = parseTm(text)
  return { id, title: machine.name, machine }
})
