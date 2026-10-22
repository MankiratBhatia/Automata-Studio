import pytest

from automata_core.convert import nfa_to_dfa
from automata_core.errors import InvalidAutomatonError, WrongKindError
from automata_core.minimize import minimize
from automata_core.model import Automaton
from automata_core.regex.thompson import regex_to_enfa
from automata_core.validate import has_errors, validate
from tests.conftest import load_raw
from tests.helpers import canon, language, make


def fixture(name: str) -> Automaton:
    return Automaton.from_dict(load_raw(name))


def test_equivalent_states_are_merged_and_unreachable_ones_dropped() -> None:
    r = minimize(fixture("dfa_non_minimal"))
    assert len(r.automaton.states) == 4
    assert "B=C" in r.automaton.states
    assert "U" not in r.automaton.states
    assert r.state_map is not None and r.state_map["B=C"] == ("B", "C")


def test_minimisation_preserves_the_language() -> None:
    d = fixture("dfa_non_minimal")
    assert language(minimize(d).automaton, d.alphabet) == language(d, d.alphabet)


def test_start_and_accepting_states_are_carried_over() -> None:
    r = minimize(fixture("dfa_non_minimal")).automaton
    assert r.start == "A"
    assert r.accepting == {"D"}


@pytest.mark.parametrize(
    ("name", "size"), [("dfa_div_by_3", 3), ("dfa_ends_with_01", 3), ("dfa_even_ones", 2)]
)
def test_already_minimal_dfas_keep_their_size(name: str, size: int) -> None:
    assert len(minimize(fixture(name)).automaton.states) == size


def test_result_is_a_complete_dfa() -> None:
    issues = validate(minimize(fixture("dfa_non_minimal")).automaton)
    assert not has_errors(issues)
    assert not any(i.code == "INCOMPLETE_DFA" for i in issues)


def test_dragon_book_example_minimises_to_four_states() -> None:
    d = nfa_to_dfa(regex_to_enfa("(a|b)*abb").automaton).automaton
    m = minimize(d).automaton
    assert len(m.states) == 4
    assert len(m.accepting) == 1


def test_third_last_symbol_dfa_is_already_minimal_at_eight_states() -> None:
    d = nfa_to_dfa(fixture("nfa_third_last_a")).automaton
    assert len(minimize(d).automaton.states) == 8


def test_missing_transitions_are_completed_with_a_trap_state() -> None:
    d = make("DFA", "p", ["q"], [("p", "a", "q")], alphabet=["a", "b"])
    r = minimize(d)
    assert len(r.automaton.states) == 3
    assert any(s not in ("p", "q") for s in r.automaton.states)
    assert language(r.automaton, ["a", "b"]) == {"a"}


def test_trap_state_name_does_not_clash_with_existing_states() -> None:
    d = make("DFA", "∅", ["q"], [("∅", "a", "q")], alphabet=["a", "b"], states=["∅", "q"])
    r = minimize(d)
    assert len(set(r.automaton.states)) == len(r.automaton.states) == 3


def test_minimal_form_is_idempotent_up_to_renaming() -> None:
    once = minimize(fixture("dfa_non_minimal")).automaton
    twice = minimize(once).automaton
    assert canon(once) == canon(twice)


def test_language_with_no_accepting_state_minimises_to_one_state() -> None:
    d = make("DFA", "p", [], [("p", "a", "q"), ("q", "a", "p")])
    r = minimize(d).automaton
    assert len(r.states) == 1 and not r.accepting


def test_universal_language_minimises_to_one_accepting_state() -> None:
    d = make("DFA", "p", ["p", "q"], [("p", "a", "q"), ("q", "a", "p")])
    r = minimize(d).automaton
    assert len(r.states) == 1 and r.accepting == set(r.states)


def test_different_dfas_for_one_language_have_the_same_minimal_form() -> None:
    # "ends with 01" built two ways: by hand, and from an NFA by subset construction.
    nfa = make(
        "NFA",
        "s",
        ["f"],
        [("s", "0", "s"), ("s", "1", "s"), ("s", "0", "m"), ("m", "1", "f")],
    )
    by_hand = minimize(fixture("dfa_ends_with_01")).automaton
    from_nfa = minimize(nfa_to_dfa(nfa).automaton).automaton
    assert canon(by_hand) == canon(from_nfa)


def test_rounds_start_with_accepting_vs_rest_and_refine_until_stable() -> None:
    r = minimize(fixture("dfa_non_minimal"))
    assert r.rounds is not None
    first, last = r.rounds[0], r.rounds[-1]
    assert sorted(len(b) for b in first) == [1, 4]  # {D} vs the rest, after pruning U
    assert len(last) == 4
    assert [len(p) for p in r.rounds] == sorted(len(p) for p in r.rounds)  # only ever splits


def test_steps_are_numbered_and_describe_each_round() -> None:
    r = minimize(fixture("dfa_non_minimal"))
    assert [s.index for s in r.steps] == list(range(len(r.steps)))
    assert r.steps[0].title == "Prepare"
    assert "unreachable" in r.steps[0].detail.lower() and "U" in r.steps[0].detail
    assert any(s.title.startswith("Round") for s in r.steps)
    assert r.steps[-1].title.startswith("Done")


def test_nfa_input_is_refused_with_a_hint() -> None:
    with pytest.raises(WrongKindError, match="DFA"):
        minimize(fixture("nfa_third_last_a"))


def test_nondeterministic_dfa_is_invalid() -> None:
    d = make("DFA", "p", ["q"], [("p", "a", "p"), ("p", "a", "q")])
    with pytest.raises(InvalidAutomatonError):
        minimize(d)


def test_steps_point_at_the_partition_round_they_describe() -> None:
    r = minimize(fixture("dfa_non_minimal"))
    assert r.rounds is not None
    assert r.steps[0].round is None  # "Prepare" is before any partition exists
    rounds = [s.round for s in r.steps[1:]]
    assert rounds == list(range(len(r.rounds))) + [len(r.rounds) - 1]  # initial, 1..k, then Done


def test_the_round_a_step_names_is_the_partition_it_reports() -> None:
    r = minimize(fixture("dfa_non_minimal"))
    assert r.rounds is not None
    initial = next(s for s in r.steps if s.title == "Initial partition")
    assert initial.round == 0
    assert len(r.rounds[initial.round]) == 2
