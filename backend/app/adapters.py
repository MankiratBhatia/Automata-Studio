"""Translate between the Pydantic API models and the pure engine's dataclasses."""

from app import schemas
from automata_core import model
from automata_core.simulate import SimStep
from automata_core.steps import Conversion, Step
from automata_core.validate import Issue


def to_core(a: schemas.Automaton) -> model.Automaton:
    return model.Automaton.from_dict(a.model_dump(by_alias=True))


def issue_out(i: Issue) -> schemas.IssueOut:
    return schemas.IssueOut(
        severity=i.severity,
        code=i.code,
        message=i.message,
        stateIds=list(i.state_ids),
        transitionIndices=list(i.transition_indices),
    )


def step_out(s: SimStep) -> schemas.SimStepOut:
    return schemas.SimStepOut(
        index=s.index,
        title=s.title,
        detail=s.detail,
        states=list(s.states),
        transitions=list(s.transitions),
        position=s.position,
        symbol=s.symbol,
    )


def from_core(a: model.Automaton) -> schemas.Automaton:
    """Core automaton -> API model. Positions are left out; the UI lays the graph out."""
    return schemas.Automaton(
        kind=a.kind,
        name=a.name,
        alphabet=list(a.alphabet),
        states=[schemas.State(id=s, label=s) for s in a.states],
        start=a.start,
        accepting=[s for s in a.states if s in a.accepting],
        transitions=[
            schemas.Transition.model_validate({"from": t.src, "to": t.dst, "symbol": t.symbol})
            for t in a.transitions
        ],
    )


def plain_step_out(s: Step) -> schemas.StepOut:
    return schemas.StepOut(
        index=s.index,
        title=s.title,
        detail=s.detail,
        states=list(s.states),
        transitions=list(s.transitions),
        addsStates=list(s.adds_states),
        addsTransitions=list(s.adds_transitions),
        round=s.round,
    )


def conversion_out(c: Conversion) -> schemas.ConvertResponse:
    return schemas.ConvertResponse(
        automaton=from_core(c.automaton),
        steps=[plain_step_out(s) for s in c.steps],
        stateMap={k: list(v) for k, v in c.state_map.items()} if c.state_map else None,
        rounds=[[list(b) for b in r] for r in c.rounds] if c.rounds else None,
    )
