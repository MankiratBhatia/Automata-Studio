import type { components } from './types.gen'

// Friendly names for the generated API types. Regenerate types.gen.ts with `npm run gen:api`.
type Schemas = components['schemas']

export type Automaton = Schemas['Automaton']
export type Issue = Schemas['IssueOut']
export type ValidateResponse = Schemas['ValidateResponse']
export type SimulateResponse = Schemas['SimulateResponse']
export type SimStep = Schemas['SimStepOut']
export type BatchResponse = Schemas['BatchResponse']
export type ApiErrorBody = Schemas['ErrorBody']
export type ConvertResponse = Schemas['ConvertResponse']
export type Step = Schemas['StepOut']
export type EquivalenceResponse = Schemas['EquivalenceResponse']
