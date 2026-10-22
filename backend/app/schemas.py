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
