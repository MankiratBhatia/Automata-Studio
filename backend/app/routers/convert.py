from fastapi import APIRouter

from app import adapters, schemas
from automata_core.convert import nfa_to_dfa, remove_epsilon
from automata_core.minimize import minimize
from automata_core.regex.thompson import regex_to_enfa

router = APIRouter(prefix="/api", tags=["convert"])

_ERRORS: dict[int | str, dict[str, object]] = {
    400: {"model": schemas.ErrorResponse},
    422: {"model": schemas.ErrorResponse},
}


@router.post("/regex-to-nfa", response_model=schemas.ConvertResponse, responses=_ERRORS)
def regex_to_nfa(req: schemas.RegexRequest) -> schemas.ConvertResponse:
    return adapters.conversion_out(regex_to_enfa(req.regex))


@router.post("/remove-epsilon", response_model=schemas.ConvertResponse, responses=_ERRORS)
def remove_epsilon_transitions(automaton: schemas.Automaton) -> schemas.ConvertResponse:
    return adapters.conversion_out(remove_epsilon(adapters.to_core(automaton)))


@router.post("/nfa-to-dfa", response_model=schemas.ConvertResponse, responses=_ERRORS)
def to_dfa(automaton: schemas.Automaton) -> schemas.ConvertResponse:
    return adapters.conversion_out(nfa_to_dfa(adapters.to_core(automaton)))


@router.post("/minimize", response_model=schemas.ConvertResponse, responses=_ERRORS)
def minimize_dfa(automaton: schemas.Automaton) -> schemas.ConvertResponse:
    return adapters.conversion_out(minimize(adapters.to_core(automaton)))
