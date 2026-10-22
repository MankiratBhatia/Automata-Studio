import pytest
from pydantic import ValidationError

from app.schemas import Automaton
from tests.conftest import fixture_names, load_raw


@pytest.mark.parametrize("name", fixture_names())
def test_fixture_round_trips_unchanged(name: str) -> None:
    raw = load_raw(name)
    parsed = Automaton.model_validate(raw)
    assert (
        parsed.model_dump(
            by_alias=True, exclude_none=False, exclude={"states": {"__all__": {"position"}}}
        )
        == raw
    )


def test_epsilon_is_null_symbol() -> None:
    a = Automaton.model_validate(load_raw("enfa_abb_thompson"))
    eps = [t for t in a.transitions if t.symbol is None]
    assert len(eps) == 8


def test_rejects_multichar_symbol() -> None:
    raw = load_raw("dfa_even_ones")
    raw["alphabet"] = ["01"]
    with pytest.raises(ValidationError):
        Automaton.model_validate(raw)


def test_rejects_duplicate_state_ids() -> None:
    raw = load_raw("dfa_even_ones")
    raw["states"].append({"id": "e", "label": "again"})
    with pytest.raises(ValidationError):
        Automaton.model_validate(raw)


def test_rejects_unknown_fields() -> None:
    raw = load_raw("dfa_even_ones")
    raw["surprise"] = 1
    with pytest.raises(ValidationError):
        Automaton.model_validate(raw)


def test_semantic_problems_are_not_schema_errors() -> None:
    # Dangling reference / missing start must parse; Phase 1 validation reports them.
    raw = load_raw("dfa_even_ones")
    raw["start"] = None
    raw["transitions"].append({"from": "e", "to": "ghost", "symbol": "0"})
    Automaton.model_validate(raw)
