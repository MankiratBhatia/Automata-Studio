import pytest

from automata_core.closure import epsilon_closure
from automata_core.convert import MAX_DFA_STATES, nfa_to_dfa, remove_epsilon
from automata_core.errors import InvalidAutomatonError, LimitExceededError
from automata_core.model import Automaton
from automata_core.regex.thompson import regex_to_enfa
from automata_core.validate import has_errors, validate
from tests.conftest import load_raw
from tests.helpers import language, make


def fixture(name: str) -> Automaton:
    return Automaton.from_dict(load_raw(name))


# --- epsilon removal ----------------------------------------------------------------------


def test_remove_epsilon_gives_an_nfa_without_epsilon_transitions() -> None:
    r = remove_epsilon(fixture("enfa_abb_thompson"))
    assert r.automaton.kind == "NFA"
    assert all(t.symbol is not None for t in r.automaton.transitions)
    assert not has_errors(validate(r.automaton))


def test_remove_epsilon_preserves_the_language() -> None:
    e = fixture("enfa_abb_thompson")
    assert language(remove_epsilon(e).automaton, e.alphabet) == language(e, e.alphabet)


def test_state_that_can_reach_acceptance_by_epsilon_becomes_accepting() -> None:
    e = make("ENFA", "p", ["q"], [("p", None, "q")], alphabet=["a"])
    assert remove_epsilon(e).automaton.accepting == {"p"}


def test_states_only_entered_by_epsilon_edges_disappear() -> None:
    # In the textbook (a|b)*abb automaton only the states entered by a real symbol survive.
    r = remove_epsilon(fixture("enfa_abb_thompson")).automaton
    assert r.states == ("0", "3", "5", "8", "9", "10")
    assert not any(i.code == "UNREACHABLE" for i in validate(r))


def test_originally_unreachable_states_are_dropped_too() -> None:
    e = make("ENFA", "p", ["p"], [("x", "a", "p")], alphabet=["a"], states=["p", "x"])
    assert remove_epsilon(e).automaton.states == ("p",)


def test_remove_epsilon_on_an_epsilon_free_nfa_keeps_the_language() -> None:
    n = fixture("nfa_third_last_a")
    assert language(remove_epsilon(n).automaton, n.alphabet) == language(n, n.alphabet)


def test_remove_epsilon_handles_epsilon_cycles() -> None:
    e = make("ENFA", "p", ["r"], [("p", None, "q"), ("q", None, "p"), ("q", "a", "r")])
    assert language(remove_epsilon(e).automaton, ["a"]) == {"a"}


def test_remove_epsilon_has_one_step_per_state() -> None:
    e = fixture("enfa_abb_thompson")
    steps = remove_epsilon(e).steps
    assert [s.index for s in steps] == list(range(len(steps)))
    assert len(steps) >= len(e.states)


def test_remove_epsilon_rejects_invalid_input() -> None:
    with pytest.raises(InvalidAutomatonError):
        remove_epsilon(make("ENFA", None, [], []))


# --- subset construction ------------------------------------------------------------------


def test_subset_construction_makes_a_complete_deterministic_automaton() -> None:
    d = nfa_to_dfa(fixture("nfa_third_last_a")).automaton
    assert d.kind == "DFA"
    issues = validate(d)
    assert not has_errors(issues)
    assert not any(i.code == "INCOMPLETE_DFA" for i in issues)


def test_third_last_symbol_blows_up_to_eight_states() -> None:
    assert len(nfa_to_dfa(fixture("nfa_third_last_a")).automaton.states) == 8


def test_subset_construction_preserves_the_language() -> None:
    n = fixture("nfa_third_last_a")
    assert language(nfa_to_dfa(n).automaton, n.alphabet) == language(n, n.alphabet)


def test_epsilon_nfa_is_converted_directly_using_closures() -> None:
    e = fixture("enfa_abb_thompson")
    r = nfa_to_dfa(e)
    assert r.automaton.start == "{0,1,2,4,7}"
    assert language(r.automaton, e.alphabet) == language(e, e.alphabet)


def test_state_ids_list_their_members_in_the_nfa_state_order() -> None:
    r = nfa_to_dfa(fixture("nfa_third_last_a"))
    assert r.automaton.start == "{q0}"
    assert "{q0,q1}" in r.automaton.states
    assert r.state_map is not None
    assert r.state_map["{q0,q1}"] == ("q0", "q1")


def test_accepting_subsets_contain_an_accepting_nfa_state() -> None:
    r = nfa_to_dfa(fixture("nfa_third_last_a"))
    assert r.state_map is not None
    for s in r.automaton.states:
        assert (s in r.automaton.accepting) == ("q3" in r.state_map[s])


def test_empty_subset_becomes_an_explicit_trap_state() -> None:
    n = make("NFA", "p", ["q"], [("p", "a", "q")], alphabet=["a", "b"])
    r = nfa_to_dfa(n)
    assert "∅" in r.automaton.states
    assert r.state_map is not None and r.state_map["∅"] == ()
    loops = {t.symbol for _, t in r.automaton.outgoing("∅") if t.dst == "∅"}
    assert loops == {"a", "b"}
    assert "∅" not in r.automaton.accepting


def test_no_trap_state_when_it_is_never_reached() -> None:
    d = nfa_to_dfa(fixture("dfa_even_ones")).automaton
    assert "∅" not in d.states


def test_only_reachable_subsets_are_built() -> None:
    n = make("NFA", "p", ["p"], [("p", "a", "p"), ("x", "a", "x")], alphabet=["a"])
    assert nfa_to_dfa(n).automaton.states == ("{p}",)


def test_a_dfa_input_gives_an_equivalent_dfa() -> None:
    d = fixture("dfa_ends_with_01")
    r = nfa_to_dfa(d).automaton
    assert len(r.states) == len(d.states)
    assert language(r, d.alphabet) == language(d, d.alphabet)


def test_empty_alphabet_gives_a_single_state() -> None:
    n = make("NFA", "p", ["p"], [], alphabet=[])
    assert nfa_to_dfa(n).automaton.states == ("{p}",)


def test_the_state_limit_stops_an_exponential_blowup() -> None:
    # "the 11th symbol from the end is a" needs 2**11 = 2048 DFA states.
    k = 11
    edges = [("q0", "a", "q0"), ("q0", "b", "q0"), ("q0", "a", "q1")]
    for i in range(1, k):
        edges += [(f"q{i}", "a", f"q{i + 1}"), (f"q{i}", "b", f"q{i + 1}")]
    n = make("NFA", "q0", [f"q{k}"], edges)
    assert MAX_DFA_STATES < 2**k
    with pytest.raises(LimitExceededError) as e:
        nfa_to_dfa(n)
    assert e.value.limit == MAX_DFA_STATES


def test_the_limit_can_be_lowered() -> None:
    with pytest.raises(LimitExceededError):
        nfa_to_dfa(fixture("nfa_third_last_a"), limit=3)


def test_the_limit_is_inclusive() -> None:
    assert len(nfa_to_dfa(fixture("nfa_third_last_a"), limit=8).automaton.states) == 8


def test_subset_construction_rejects_invalid_input() -> None:
    with pytest.raises(InvalidAutomatonError):
        nfa_to_dfa(make("NFA", None, [], []))


def test_subset_steps_describe_each_move() -> None:
    r = nfa_to_dfa(fixture("nfa_third_last_a"))
    assert [s.index for s in r.steps] == list(range(len(r.steps)))
    assert r.steps[0].title == "Start"
    assert any("{q0} on 'a'" in s.title for s in r.steps)
    assert any("new state" in s.detail for s in r.steps)
    assert any("existing state" in s.detail for s in r.steps)


def test_subset_steps_highlight_the_nfa_states_and_edges_they_read() -> None:
    n = fixture("nfa_third_last_a")
    r = nfa_to_dfa(n)
    step = next(s for s in r.steps if s.title == "{q0} on 'a'")
    assert set(step.states) == {"q0"}
    # q0 --a--> q0 and q0 --a--> q1 are transitions 0 and 2 in the fixture.
    assert step.transitions == (0, 2)


def test_closure_of_the_start_is_the_first_dfa_state() -> None:
    e = fixture("enfa_abb_thompson")
    r = nfa_to_dfa(e)
    assert r.state_map is not None
    assert set(r.state_map[r.automaton.start]) == set(epsilon_closure(e, {"0"}))  # type: ignore[index]


def test_regex_pipeline_to_dfa_is_deterministic() -> None:
    d1 = nfa_to_dfa(regex_to_enfa("(a|b)*abb").automaton).automaton
    d2 = nfa_to_dfa(regex_to_enfa("(a|b)*abb").automaton).automaton
    assert d1 == d2


# --- what each subset-construction step adds ------------------------------------------------


def test_subset_steps_add_every_state_and_transition_exactly_once() -> None:
    r = nfa_to_dfa(fixture("nfa_third_last_a"))
    states = [x for s in r.steps for x in s.adds_states]
    edges = [x for s in r.steps for x in s.adds_transitions]
    assert sorted(states) == sorted(r.automaton.states)
    assert sorted(edges) == list(range(len(r.automaton.transitions)))


def test_each_move_step_adds_the_transition_it_describes() -> None:
    r = nfa_to_dfa(fixture("nfa_third_last_a"))
    for step in r.steps[1:-1]:
        (i,) = step.adds_transitions
        t = r.automaton.transitions[i]
        assert step.title == f"{t.src} on '{t.symbol}'"
        assert f"state {t.dst}" in step.detail


def test_a_move_adds_a_state_exactly_when_it_says_new() -> None:
    r = nfa_to_dfa(fixture("nfa_third_last_a"))
    for step in r.steps[1:-1]:
        assert bool(step.adds_states) == ("new state" in step.detail)


def test_the_start_step_adds_the_start_state() -> None:
    r = nfa_to_dfa(fixture("nfa_third_last_a"))
    assert r.steps[0].adds_states == (r.automaton.start,)
