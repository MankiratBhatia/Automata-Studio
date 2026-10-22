import pytest

from automata_core.errors import InputSymbolError, InvalidAutomatonError
from automata_core.model import Automaton
from automata_core.simulate import simulate, simulate_batch
from tests.conftest import fixture_names, load_raw
from tests.helpers import make


def load(name: str) -> Automaton:
    return Automaton.from_dict(load_raw(name))


@pytest.mark.parametrize("name", fixture_names())
def test_fixture_languages(name: str, expectations: dict[str, dict[str, list[str]]]) -> None:
    a = load(name)
    for w in expectations[name]["accept"]:
        assert simulate(a, w).accepted, f"{name} should accept {w!r}"
    for w in expectations[name]["reject"]:
        assert not simulate(a, w).accepted, f"{name} should reject {w!r}"


def test_equivalence_demo_pair_differs_exactly_on_00() -> None:
    a, b = load("dfa_even_ones"), load("dfa_even_ones_but_not_00")
    words = ["".join(p) for n in range(1, 6) for p in _product("01", n)]
    assert [w for w in words if simulate(a, w).accepted != simulate(b, w).accepted] == ["00"]


def _product(chars: str, n: int) -> list[tuple[str, ...]]:
    import itertools

    return list(itertools.product(chars, repeat=n))


# --- DFA traces -------------------------------------------------------------------------


def test_dfa_trace_has_one_state_per_step() -> None:
    t = simulate(load("dfa_ends_with_01"), "101")
    assert t.accepted and not t.stuck
    assert [s.states for s in t.steps] == [("q0",), ("q0",), ("q1",), ("q2",)]
    assert [s.position for s in t.steps] == [0, 1, 2, 3]
    assert [s.symbol for s in t.steps] == [None, "1", "0", "1"]
    assert [s.index for s in t.steps] == [0, 1, 2, 3]


def test_dfa_trace_highlights_the_transition_used() -> None:
    t = simulate(load("dfa_ends_with_01"), "0")
    # transition 0 is q0 --0--> q1 in the fixture
    assert t.steps[1].transitions == (0,)


def test_empty_input_accepts_iff_start_is_accepting() -> None:
    assert simulate(load("dfa_even_ones"), "").accepted
    t = simulate(load("dfa_ends_with_01"), "")
    assert not t.accepted
    assert len(t.steps) == 1


def test_missing_transition_rejects_and_marks_trace_stuck() -> None:
    a = make("DFA", "p", ["q"], [("p", "a", "q")], alphabet=["a", "b"])
    t = simulate(a, "ba")
    assert not t.accepted and t.stuck
    assert t.steps[-1].states == ()
    assert "No transition on 'b'" in t.steps[-1].detail
    assert len(t.steps) == 2  # stops reading once the run has died


# --- NFA / epsilon-NFA ------------------------------------------------------------------


def test_nfa_shows_several_active_states() -> None:
    t = simulate(load("nfa_third_last_a"), "aa")
    assert t.steps[-1].states == ("q0", "q1", "q2")
    assert simulate(load("nfa_third_last_a"), "ab").steps[-1].states == ("q0", "q2")


def test_nfa_accepts_if_any_branch_accepts() -> None:
    a = make("NFA", "p", ["q"], [("p", "a", "p"), ("p", "a", "q")])
    assert simulate(a, "a").accepted
    assert simulate(a, "aa").accepted  # p loops once, then branches to q
    assert not simulate(a, "").accepted


def test_start_step_applies_epsilon_closure() -> None:
    t = simulate(load("enfa_abb_thompson"), "")
    assert t.steps[0].states == ("0", "1", "2", "4", "7")
    assert "epsilon-closure" in t.steps[0].detail
    assert t.steps[0].transitions  # the epsilon edges that were followed


def test_epsilon_cycle_does_not_hang() -> None:
    a = make("ENFA", "a", ["c"], [("a", None, "b"), ("b", None, "a"), ("b", "x", "c")])
    assert simulate(a, "x").accepted


def test_epsilon_only_acceptance_on_empty_input() -> None:
    a = make("ENFA", "p", ["q"], [("p", None, "q")], alphabet=["a"])
    assert simulate(a, "").accepted


def test_active_states_follow_declared_state_order() -> None:
    a = make("NFA", "z", ["z"], [("z", "a", "z"), ("z", "a", "m")], states=["z", "m"])
    assert simulate(a, "a").steps[-1].states == ("z", "m")


# --- errors -----------------------------------------------------------------------------


def test_unknown_input_symbol_reports_position() -> None:
    with pytest.raises(InputSymbolError) as e:
        simulate(load("dfa_ends_with_01"), "01x")
    assert e.value.position == 2 and e.value.symbol == "x"


def test_invalid_automaton_cannot_be_simulated() -> None:
    a = make("DFA", None, [], [])
    with pytest.raises(InvalidAutomatonError) as e:
        simulate(a, "")
    assert [i.code for i in e.value.issues] == ["NO_START"]


def test_warnings_do_not_block_simulation() -> None:
    a = make("DFA", "p", ["p"], [("p", "a", "p")], alphabet=["a", "b"])  # incomplete
    assert simulate(a, "aa").accepted


# --- batch ------------------------------------------------------------------------------


def test_batch_mixes_results_and_errors() -> None:
    res = simulate_batch(load("dfa_ends_with_01"), ["01", "10", "0x"])
    assert [r.accepted for r in res] == [True, False, None]
    assert [r.input for r in res] == ["01", "10", "0x"]
    assert res[2].error is not None and res[0].error is None


def test_batch_fails_whole_request_for_invalid_automaton() -> None:
    with pytest.raises(InvalidAutomatonError):
        simulate_batch(make("DFA", None, [], []), ["a"])
