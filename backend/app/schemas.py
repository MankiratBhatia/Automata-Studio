"""Canonical automaton schema (v1). Mirrors docs/PLAN.md section 2."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

AutomatonKind = Literal["DFA", "NFA", "ENFA"]


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float


class State(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    label: str
    position: Position | None = None


class Transition(BaseModel):
    # "from" is a Python keyword, so the attribute is from_ and the JSON key is "from".
    from_: str = Field(alias="from")
    to: str
    symbol: str | None = Field(description="Single character, or null for epsilon")

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Automaton(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1] = 1
    kind: AutomatonKind
    name: str = Field(default="", max_length=200)
    alphabet: list[str] = Field(max_length=64)
    states: list[State] = Field(max_length=1000)
    start: str | None
    accepting: list[str]
    transitions: list[Transition] = Field(max_length=20000)

    @model_validator(mode="after")
    def _check_shape(self) -> "Automaton":
        # Only structural checks here. Semantic problems (unknown symbols, dangling
        # references, nondeterminism) are reported by the validation engine in Phase 1
        # so the UI can show them as issues instead of rejecting the whole document.
        for sym in self.alphabet:
            if len(sym) != 1:
                raise ValueError(f"alphabet symbol {sym!r} must be a single character")
        for t in self.transitions:
            if t.symbol is not None and len(t.symbol) != 1:
                raise ValueError(f"transition symbol {t.symbol!r} must be a single character")
        ids = [s.id for s in self.states]
        if len(ids) != len(set(ids)):
            raise ValueError("state ids must be unique")
        return self


class HealthResponse(BaseModel):
    status: Literal["ok"]
    version: str


# --- Phase 1: validate / simulate -------------------------------------------------------


class IssueOut(BaseModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    stateIds: list[str]
    transitionIndices: list[int]


class ValidateResponse(BaseModel):
    issues: list[IssueOut]


class SimulateRequest(BaseModel):
    automaton: Automaton
    input: str = Field(max_length=2000)


class SimStepOut(BaseModel):
    index: int
    title: str
    detail: str
    states: list[str]
    transitions: list[int]
    position: int
    symbol: str | None


class SimulateResponse(BaseModel):
    accepted: bool
    stuck: bool
    steps: list[SimStepOut]


class BatchRequest(BaseModel):
    automaton: Automaton
    inputs: list[Annotated[str, Field(max_length=2000)]] = Field(max_length=500)


class BatchItem(BaseModel):
    input: str
    accepted: bool | None
    error: str | None


class BatchResponse(BaseModel):
    results: list[BatchItem]


class ErrorBody(BaseModel):
    code: str
    message: str
    position: int | None = None
    issues: list[IssueOut] | None = None


class ErrorResponse(BaseModel):
    error: ErrorBody


# --- Phase 3: conversions ---------------------------------------------------------------


class StepOut(BaseModel):
    index: int
    title: str
    detail: str
    states: list[str]
    transitions: list[int]
    # How the result grows: state ids and transition indices first created by this step.
    addsStates: list[str]
    addsTransitions: list[int]
    # Minimisation: index into ConvertResponse.rounds shown by this step, else null.
    round: int | None = None


class RegexRequest(BaseModel):
    regex: str = Field(max_length=500)


class ConvertResponse(BaseModel):
    automaton: Automaton
    steps: list[StepOut]
    # New state id -> the source states it stands for (subset construction, minimisation).
    stateMap: dict[str, list[str]] | None = None
    # Minimisation: the partition into blocks after each round, starting with round 0.
    rounds: list[list[list[str]]] | None = None


# --- Phase 4: equivalence ---------------------------------------------------------------


class EquivalenceRequest(BaseModel):
    a: Automaton
    b: Automaton


class EquivalenceResponse(BaseModel):
    equivalent: bool
    # A shortest string accepted by exactly one automaton. May be "" (the empty string).
    counterexample: str | None
    aAccepts: bool | None
    bAccepts: bool | None
    # How many pairs of DFA states the product search visited.
    explored: int


# --- Phase 5: saved projects ------------------------------------------------------------


class ProjectIn(BaseModel):
    automaton: Automaton


class ProjectSummary(BaseModel):
    id: str
    name: str
    kind: AutomatonKind
    createdAt: str
    updatedAt: str


class Project(ProjectSummary):
    automaton: Automaton


# --- Phase 6: pushdown automata and Turing machines ------------------------------------


def _single_chars(values: list[str], what: str) -> None:
    for v in values:
        if len(v) != 1:
            raise ValueError(f"{what} symbol {v!r} must be a single character")


def _unique_ids(states: list[State]) -> None:
    ids = [s.id for s in states]
    if len(ids) != len(set(ids)):
        raise ValueError("state ids must be unique")


class PdaTransition(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    input: str | None = Field(description="One input symbol, or null to read nothing (epsilon)")
    pop: str | None = Field(description="One stack symbol to pop, or null to pop nothing")
    push: str = Field(max_length=20, description="Symbols to push, top first; empty pushes nothing")


class Pda(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1] = 1
    name: str = Field(default="", max_length=200)
    inputAlphabet: list[str] = Field(max_length=64)
    stackAlphabet: list[str] = Field(max_length=64)
    startStack: str = Field(
        max_length=1, description="Initial stack symbol; empty for an empty stack"
    )
    acceptBy: Literal["finalState", "emptyStack"]
    states: list[State] = Field(max_length=200)
    start: str | None
    accepting: list[str]
    transitions: list[PdaTransition] = Field(max_length=2000)

    @model_validator(mode="after")
    def _check_shape(self) -> "Pda":
        _single_chars(self.inputAlphabet, "input alphabet")
        _single_chars(self.stackAlphabet, "stack alphabet")
        _unique_ids(self.states)
        for t in self.transitions:
            if t.input is not None and len(t.input) != 1:
                raise ValueError(f"input symbol {t.input!r} must be a single character")
            if t.pop is not None and len(t.pop) != 1:
                raise ValueError(f"pop symbol {t.pop!r} must be a single character")
        return self


class PdaRunRequest(BaseModel):
    pda: Pda
    input: str = Field(max_length=200)


class PdaStepOut(BaseModel):
    index: int
    state: str
    position: int
    stack: str
    transition: int | None
    note: str


class PdaRunResponse(BaseModel):
    verdict: Literal["accepted", "rejected", "limit"]
    # True when `steps` is the closest attempt rather than an accepting computation.
    closest: bool
    explored: int
    reason: str
    steps: list[PdaStepOut]


class TmTransition(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: str = Field(alias="from")
    to: str
    read: str = Field(min_length=1, max_length=1)
    write: str = Field(min_length=1, max_length=1)
    move: Literal["L", "R", "S"]


class Tm(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1] = 1
    name: str = Field(default="", max_length=200)
    inputAlphabet: list[str] = Field(max_length=64)
    tapeAlphabet: list[str] = Field(max_length=64)
    blank: str = Field(min_length=1, max_length=1)
    states: list[State] = Field(max_length=200)
    start: str | None
    accepting: list[str]
    rejecting: list[str]
    transitions: list[TmTransition] = Field(max_length=2000)

    @model_validator(mode="after")
    def _check_shape(self) -> "Tm":
        _single_chars(self.inputAlphabet, "input alphabet")
        _single_chars(self.tapeAlphabet, "tape alphabet")
        _unique_ids(self.states)
        return self


class TmRunRequest(BaseModel):
    tm: Tm
    input: str = Field(max_length=500)
    maxSteps: int = Field(default=10_000, ge=1, le=10_000)


class TmStepOut(BaseModel):
    index: int
    state: str
    head: int
    transition: int | None
    read: str | None
    write: str | None
    cell: int | None
    note: str


class TmRunResponse(BaseModel):
    status: Literal["accepted", "rejected", "limit"]
    reason: str
    # The non-blank part of the final tape.
    output: str
    steps: list[TmStepOut]
