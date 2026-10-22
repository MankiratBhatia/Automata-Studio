import type {
  ApiErrorBody,
  Automaton,
  BatchResponse,
  ConvertResponse,
  EquivalenceResponse,
  Issue,
  SimulateResponse,
  ValidateResponse,
} from './types'

export interface Health {
  status: 'ok'
  version: string
}

export class ApiError extends Error {
  readonly status: number | null
  readonly code: string | null
  readonly position: number | null
  readonly issues: Issue[]

  constructor(
    message: string,
    status: number | null = null,
    extra: { code?: string; position?: number | null; issues?: Issue[] } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = extra.code ?? null
    this.position = extra.position ?? null
    this.issues = extra.issues ?? []
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError('Cannot reach the backend. Is it running on port 8000?')
  }
  if (!res.ok) {
    // The backend answers with {"error": {code, message, ...}}; fall back for anything else.
    const body = (await res.json().catch(() => null)) as { error?: ApiErrorBody } | null
    if (body?.error) {
      const { code, message, position, issues } = body.error
      throw new ApiError(message, res.status, { code, position, issues: issues ?? [] })
    }
    throw new ApiError(`Request failed (${res.status})`, res.status)
  }
  return (await res.json()) as T
}

const post = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const getHealth = (): Promise<Health> => request<Health>('/api/health')

export const validateAutomaton = (automaton: Automaton): Promise<ValidateResponse> =>
  post('/api/validate', automaton)

export const simulate = (automaton: Automaton, input: string): Promise<SimulateResponse> =>
  post('/api/simulate', { automaton, input })

export const simulateBatch = (automaton: Automaton, inputs: string[]): Promise<BatchResponse> =>
  post('/api/simulate/batch', { automaton, inputs })

export const regexToNfa = (regex: string): Promise<ConvertResponse> =>
  post('/api/regex-to-nfa', { regex })

export const removeEpsilon = (automaton: Automaton): Promise<ConvertResponse> =>
  post('/api/remove-epsilon', automaton)

export const nfaToDfa = (automaton: Automaton): Promise<ConvertResponse> =>
  post('/api/nfa-to-dfa', automaton)

export const minimizeDfa = (automaton: Automaton): Promise<ConvertResponse> =>
  post('/api/minimize', automaton)

export const checkEquivalence = (a: Automaton, b: Automaton): Promise<EquivalenceResponse> =>
  post('/api/equivalence', { a, b })
