import pytest

from automata_core.convert import nfa_to_dfa
from automata_core.equivalence import check_equivalence
from automata_core.errors import InvalidAutomatonError, LimitExceededError
from automata_core.minimize import minimize
from automata_core.model import Automaton
from automata_core.regex.thompson import regex_to_enfa
from tests.conftest import load_raw
from tests.helpers import make


def fixture(name: str) -> Automaton:
    return Automaton.from_dict(load_raw(name))


# --- equivalent pairs -----------------------------------------------------------------------


def test_an_automaton_is_equivalent_to_itself() -> None:
    d = fixture("dfa_ends_with_01")
    r = check_equivalence(d, d)
    assert r.equivalent and r.counterexample is None
    assert r.a_accepts is None and r.b_accepts is None


def test_a_dfa_is_equivalent_to_its_minimal_form() -> None:
    d = fixture("dfa_non_minimal")
    assert check_equivalence(d, minimize(d).automaton).equivalent


def test_a_regex_is_equivalent_to_its_dfa_and_minimal_dfa() -> None:
    enfa = regex_to_enfa("(a|b)*abb").automaton
    dfa = nfa_to_dfa(enfa).automaton
    assert check_equivalence(enfa, dfa).equivalent
    assert check_equivalence(enfa, minimize(dfa).automaton).equivalent


def test_different_kinds_can_be_compared_directly() -> None:
    nfa = fixture("nfa_third_last_a")
    assert check_equivalence(nfa, nfa_to_dfa(nfa).automaton).equivalent


def test_two_regexes_for_the_same_language_are_equivalent() -> None:
    a = regex_to_enfa("(a|b)*").automaton
    b = regex_to_enfa("(a*b*)*").automaton
    assert check_equivalence(a, b).equivalent


def test_extra_alphabet_symbols_that_are_never_used_do_not_matter() -> None:
    a = make("DFA", "p", ["p"], [("p", "a", "p")], alphabet=["a"])
    b = make("DFA", "p", ["p"], [("p", "a", "p")], alphabet=["a", "b"])  # no b transitions
    assert check_equivalence(a, b).equivalent


def test_two_empty_languages_are_equivalent() -> None:
    a = make("DFA", "p", [], [("p", "a", "p")])
    b = regex_to_enfa("a∅").automaton
    assert check_equivalence(a, b).equivalent


# --- counterexamples ------------------------------------------------------------------------


def test_the_demo_pair_differs_on_exactly_the_string_00() -> None:
    a, b = fixture("dfa_even_ones"), fixture("dfa_even_ones_but_not_00")
    r = check_equivalence(a, b)
    assert not r.equivalent
    assert r.counterexample == "00"
    assert (r.a_accepts, r.b_accepts) == (True, False)


def test_the_roles_swap_when_the_arguments_swap() -> None:
    a, b = fixture("dfa_even_ones"), fixture("dfa_even_ones_but_not_00")
    r = check_equivalence(b, a)
    assert r.counterexample == "00"
    assert (r.a_accepts, r.b_accepts) == (False, True)


def test_the_empty_string_can_be_the_counterexample() -> None:
    a = make("DFA", "p", ["p"], [("p", "a", "p")])
    b = make("DFA", "p", [], [("p", "a", "p")])
    r = check_equivalence(a, b)
    assert r.counterexample == ""  # not None: "" is a real counterexample
    assert (r.a_accepts, r.b_accepts) == (True, False)


def test_a_symbol_only_one_automaton_knows_can_be_the_counterexample() -> None:
    a = make("DFA", "p", ["p"], [("p", "a", "p")], alphabet=["a"])
    b = make("NFA", "p", ["p", "q"], [("p", "a", "p"), ("p", "b", "q")], alphabet=["a", "b"])
    r = check_equivalence(a, b)
    assert r.counterexample == "b"
    assert (r.a_accepts, r.b_accepts) == (False, True)


def test_the_counterexample_is_the_shortest_one() -> None:
    # "ends with 01" vs "ends with 11": shortest difference is "01" (length 2), though
    # many longer strings also differ.
    a = make(
        "NFA", "s", ["f"], [("s", "0", "s"), ("s", "1", "s"), ("s", "0", "m"), ("m", "1", "f")]
    )
    b = make(
        "NFA", "s", ["f"], [("s", "0", "s"), ("s", "1", "s"), ("s", "1", "m"), ("m", "1", "f")]
    )
    r = check_equivalence(a, b)
    assert r.counterexample == "01"


def test_among_equally_short_counterexamples_the_alphabet_order_wins() -> None:
    # Single symbols "a" and "b" both differ; the smaller symbol is reported, deterministically.
    a = make(
        "DFA",
        "p",
        ["q"],
        [("p", "a", "q"), ("p", "b", "q")],
        alphabet=["a", "b"],
        states=["p", "q"],
    )
    b = make("DFA", "p", [], [("p", "a", "p"), ("p", "b", "p")], alphabet=["a", "b"])
    assert check_equivalence(a, b).counterexample == "a"


def test_a_long_shortest_counterexample_is_found() -> None:
    # "exactly 7 a's" vs "exactly 8 a's": shortest difference has 7 symbols.
    def exactly(n: int) -> Automaton:
        edges = [(f"q{i}", "a", f"q{i + 1}") for i in range(n)]
        return make("DFA", "q0", [f"q{n}"], edges, alphabet=["a"])

    r = check_equivalence(exactly(7), exactly(8))
    assert r.counterexample == "a" * 7


def test_it_reports_how_many_product_states_it_explored() -> None:
    d = fixture("dfa_even_ones")
    assert check_equivalence(d, d).explored == 2  # only the diagonal pairs (e,e), (o,o)


# --- errors ---------------------------------------------------------------------------------


def test_an_invalid_automaton_is_rejected() -> None:
    with pytest.raises(InvalidAutomatonError):
        check_equivalence(make("DFA", None, [], []), fixture("dfa_even_ones"))
    with pytest.raises(InvalidAutomatonError):
        check_equivalence(fixture("dfa_even_ones"), make("DFA", None, [], []))


def test_an_exponential_nfa_hits_the_state_limit() -> None:
    k = 11
    edges = [("q0", "a", "q0"), ("q0", "b", "q0"), ("q0", "a", "q1")]
    for i in range(1, k):
        edges += [(f"q{i}", "a", f"q{i + 1}"), (f"q{i}", "b", f"q{i + 1}")]
    big = make("NFA", "q0", [f"q{k}"], edges)
    with pytest.raises(LimitExceededError):
        check_equivalence(big, fixture("dfa_even_ones"))
