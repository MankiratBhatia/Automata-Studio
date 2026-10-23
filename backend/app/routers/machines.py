from fastapi import APIRouter

from app import adapters, schemas
from automata_core.pda import Pda, run_pda, validate_pda
from automata_core.tm import Tm, run_tm, validate_tm

router = APIRouter(prefix="/api", tags=["machines"])

_ERRORS: dict[int | str, dict[str, object]] = {
    400: {"model": schemas.ErrorResponse},
    422: {"model": schemas.ErrorResponse},
}


def _pda(m: schemas.Pda) -> Pda:
    return Pda.from_dict(m.model_dump(by_alias=True))


def _tm(m: schemas.Tm) -> Tm:
    return Tm.from_dict(m.model_dump(by_alias=True))


@router.post("/pda/validate", response_model=schemas.ValidateResponse, responses=_ERRORS)
def validate_pushdown(pda: schemas.Pda) -> schemas.ValidateResponse:
    return schemas.ValidateResponse(issues=[adapters.issue_out(i) for i in validate_pda(_pda(pda))])


@router.post("/pda/run", response_model=schemas.PdaRunResponse, responses=_ERRORS)
def run_pushdown(req: schemas.PdaRunRequest) -> schemas.PdaRunResponse:
    run = run_pda(_pda(req.pda), req.input)
    return schemas.PdaRunResponse(
        verdict=run.verdict,
        closest=run.closest,
        explored=run.explored,
        reason=run.reason,
        steps=[
            schemas.PdaStepOut(
                index=s.index,
                state=s.state,
                position=s.position,
                stack=s.stack,
                transition=s.transition,
                note=s.note,
            )
            for s in run.steps
        ],
    )


@router.post("/tm/validate", response_model=schemas.ValidateResponse, responses=_ERRORS)
def validate_turing(tm: schemas.Tm) -> schemas.ValidateResponse:
    return schemas.ValidateResponse(issues=[adapters.issue_out(i) for i in validate_tm(_tm(tm))])


@router.post("/tm/run", response_model=schemas.TmRunResponse, responses=_ERRORS)
def run_turing(req: schemas.TmRunRequest) -> schemas.TmRunResponse:
    run = run_tm(_tm(req.tm), req.input, req.maxSteps)
    return schemas.TmRunResponse(
        status=run.status,
        reason=run.reason,
        output=run.output,
        steps=[
            schemas.TmStepOut(
                index=s.index,
                state=s.state,
                head=s.head,
                transition=s.transition,
                read=s.read,
                write=s.write,
                cell=s.cell,
                note=s.note,
            )
            for s in run.steps
        ],
    )
