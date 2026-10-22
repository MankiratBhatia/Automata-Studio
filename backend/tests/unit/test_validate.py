import pytest

from automata_core.model import Automaton
from automata_core.validate import Issue, has_errors, validate
from tests.conftest import fixture_names, load_raw
from tests.helpers import make


def codes(a: Automaton) -> list[str]:
    return [i.code for i in validate(a)]


def only(a: Automaton, code: str) -> Issue:
    found = [i for i in validate(a) if i.code == code]
    assert len(found) == 1, found
    return found[0]


GOOD_DFA = make(
    "DFA", "p", ["q"], [("p", "a", "q"), ("p", "b", "p"), ("q", "a", "q"), ("q", "b", "p")]
)


def test_clean_dfa_has_no_issues() -> None:
    assert validate(GOOD_DFA) == []


@pytest.mark.parametrize("name", fixture_names())
def test_fixtures_have_no_errors(name: str) -> None:
    assert not has_errors(validate(Automaton.from_dict(load_raw(name))))


def test_non_minimal_fixture_reports_unreachable_state() -> None:
    issue = only(Automaton.from_dict(load_raw("dfa_non_minimal")), "UNREACHABLE")
    assert issue.state_ids == ("U",)


# --- NO_START ---------------------------------------------------------------------------


def test_no_start_when_unset() -> None:
    a = make("DFA", None, ["q"], [("q", "a", "q")])
    assert only(a, "NO_START").severity == "error"


def test_no_start_when_start_does_not_exist() -> None:
    a = make("DFA", "ghost", ["q"], [("q", "a", "q")], states=["q"])
    assert "does not exist" in only(a, "NO_START").message


# --- DANGLING_REF -----------------------------------------------------------------------


def test_dangling_transition_target() -> None:
    a = make("NFA", "p", ["p"], [("p", "a", "ghost")], states=["p"])
    issue = only(a, "DANGLING_REF")
    assert issue.transition_indices == (0,)
    assert "ghost" in issue.message


def test_dangling_accepting_state() -> None:
    a = make("NFA", "p", ["p", "ghost"], [("p", "a", "p")], states=["p"])
    assert "ghost" in only(a, "DANGLING_REF").message


def test_no_dangling_ref_on_valid_automaton() -> None:
    assert "DANGLING_REF" not in codes(GOOD_DFA)


# --- UNKNOWN_SYMBOL / EPSILON_NOT_ALLOWED -----------------------------------------------


def test_unknown_symbol() -> None:
    a = make("NFA", "p", ["p"], [("p", "z", "p")], alphabet=["a"])
    assert only(a, "UNKNOWN_SYMBOL").transition_indices == (0,)


def test_known_symbol_is_fine() -> None:
    assert "UNKNOWN_SYMBOL" not in codes(GOOD_DFA)


@pytest.mark.parametrize("kind", ["DFA", "NFA"])
def test_epsilon_rejected_outside_enfa(kind: str) -> None:
    a = make(kind, "p", ["q"], [("p", None, "q")], alphabet=["a"])  # type: ignore[arg-type]
    assert only(a, "EPSILON_NOT_ALLOWED").transition_indices == (0,)


def test_epsilon_allowed_in_enfa() -> None:
    a = make("ENFA", "p", ["q"], [("p", None, "q")], alphabet=["a"])
    assert "EPSILON_NOT_ALLOWED" not in codes(a)


# --- NONDETERMINISTIC / DUPLICATE_TRANSITION --------------------------------------------


def test_dfa_nondeterminism_is_an_error() -> None:
    a = make("DFA", "p", ["q"], [("p", "a", "p"), ("p", "a", "q")])
    issue = only(a, "NONDETERMINISTIC")
    assert issue.severity == "error"
    assert issue.state_ids == ("p",)
    assert issue.transition_indices == (0, 1)


def test_nfa_branching_is_not_an_error() -> None:
    a = make("NFA", "p", ["q"], [("p", "a", "p"), ("p", "a", "q")])
    assert not has_errors(validate(a))
    assert "NONDETERMINISTIC" not in codes(a)


def test_duplicate_transition_warns_but_is_not_nondeterminism() -> None:
    a = make("DFA", "p", ["p"], [("p", "a", "p"), ("p", "a", "p")])
    assert only(a, "DUPLICATE_TRANSITION").severity == "warning"
    assert "NONDETERMINISTIC" not in codes(a)


# --- INCOMPLETE_DFA ---------------------------------------------------------------------


def test_incomplete_dfa_names_missing_symbols() -> None:
    a = make("DFA", "p", ["p"], [("p", "a", "p")], alphabet=["a", "b"])
    issue = only(a, "INCOMPLETE_DFA")
    assert issue.severity == "warning"
    assert issue.state_ids == ("p",)
    assert "b" in issue.message


def test_incomplete_check_only_applies_to_dfa() -> None:
    a = make("NFA", "p", ["p"], [("p", "a", "p")], alphabet=["a", "b"])
    assert "INCOMPLETE_DFA" not in codes(a)


# --- UNREACHABLE ------------------------------------------------------------------------


def test_unreachable_state_is_reported() -> None:
    a = make("NFA", "p", ["p"], [("p", "a", "p"), ("x", "a", "p")])
    assert only(a, "UNREACHABLE").state_ids == ("x",)


def test_epsilon_edges_count_for_reachability() -> None:
    a = make("ENFA", "p", ["q"], [("p", None, "q")], alphabet=["a"])
    assert "UNREACHABLE" not in codes(a)


def test_reachability_skipped_without_start() -> None:
    a = make("NFA", None, ["p"], [("p", "a", "p")])
    assert "UNREACHABLE" not in codes(a)


# --- DEAD_STATE -------------------------------------------------------------------------


def test_dead_state_is_reported() -> None:
    # r is reachable but can never reach accepting q, and it is not a self-looping trap.
    a = make("NFA", "p", ["q"], [("p", "a", "q"), ("p", "b", "r")], alphabet=["a", "b"])
    assert only(a, "DEAD_STATE").state_ids == ("r",)


def test_intentional_trap_is_not_dead() -> None:
    a = make(
        "DFA",
        "p",
        ["p"],
        [("p", "a", "p"), ("p", "b", "t"), ("t", "a", "t"), ("t", "b", "t")],
    )
    assert "DEAD_STATE" not in codes(a)


def test_unreachable_states_are_not_also_dead() -> None:
    a = make("NFA", "p", ["p"], [("p", "a", "p"), ("x", "a", "x")])
    assert "DEAD_STATE" not in codes(a)
    assert "UNREACHABLE" in codes(a)


# --- NO_ACCEPTING / EMPTY_ALPHABET ------------------------------------------------------


def test_no_accepting_states() -> None:
    a = make("NFA", "p", [], [("p", "a", "p")])
    assert only(a, "NO_ACCEPTING").severity == "warning"


def test_has_accepting_states() -> None:
    assert "NO_ACCEPTING" not in codes(GOOD_DFA)


def test_empty_alphabet() -> None:
    a = make("NFA", "p", ["p"], [], alphabet=[])
    assert "EMPTY_ALPHABET" in codes(a)


# --- ordering ---------------------------------------------------------------------------


def test_errors_sort_before_warnings() -> None:
    a = make("DFA", None, [], [("p", "a", "p")], alphabet=["a", "b"])
    severities = [i.severity for i in validate(a)]
    assert severities == sorted(severities, key=lambda s: s != "error")
    assert severities[0] == "error" and severities[-1] == "warning"
