from fastapi import APIRouter

from app import adapters, schemas
from automata_core.equivalence import check_equivalence
from automata_core.simulate import simulate, simulate_batch
from automata_core.validate import validate

router = APIRouter(prefix="/api", tags=["analyze"])

_ERRORS: dict[int | str, dict[str, object]] = {
    400: {"model": schemas.ErrorResponse},
    422: {"model": schemas.ErrorResponse},
}


@router.post("/validate", response_model=schemas.ValidateResponse, responses=_ERRORS)
def validate_automaton(automaton: schemas.Automaton) -> schemas.ValidateResponse:
    issues = validate(adapters.to_core(automaton))
    return schemas.ValidateResponse(issues=[adapters.issue_out(i) for i in issues])


@router.post("/simulate", response_model=schemas.SimulateResponse, responses=_ERRORS)
def simulate_input(req: schemas.SimulateRequest) -> schemas.SimulateResponse:
    trace = simulate(adapters.to_core(req.automaton), req.input)
    return schemas.SimulateResponse(
        accepted=trace.accepted,
        stuck=trace.stuck,
        steps=[adapters.step_out(s) for s in trace.steps],
    )


@router.post("/simulate/batch", response_model=schemas.BatchResponse, responses=_ERRORS)
def simulate_many(req: schemas.BatchRequest) -> schemas.BatchResponse:
    results = simulate_batch(adapters.to_core(req.automaton), req.inputs)
    return schemas.BatchResponse(
        results=[
            schemas.BatchItem(input=r.input, accepted=r.accepted, error=r.error) for r in results
        ]
    )


@router.post("/equivalence", response_model=schemas.EquivalenceResponse, responses=_ERRORS)
def equivalence(req: schemas.EquivalenceRequest) -> schemas.EquivalenceResponse:
    r = check_equivalence(adapters.to_core(req.a), adapters.to_core(req.b))
    return schemas.EquivalenceResponse(
        equivalent=r.equivalent,
        counterexample=r.counterexample,
        aAccepts=r.a_accepts,
        bAccepts=r.b_accepts,
        explored=r.explored,
    )
