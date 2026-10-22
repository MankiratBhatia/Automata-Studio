"""The equivalence checker against brute force on random automata."""

from hypothesis import given, settings
from hypothesis import strategies as st

from automata_core.convert import nfa_to_dfa
from automata_core.equivalence import check_equivalence
from automata_core.minimize import minimize
from automata_core.model import Automaton
from automata_core.simulate import simulate_batch
from tests.helpers import all_words
from tests.strategies import automata

SETTINGS = settings()
MAX_LEN = 5


def accepts(a: Automaton, w: str) -> bool:
    return simulate_batch(a, [w])[0].accepted is True  # unknown symbol = not accepted


def shortest_difference(a: Automaton, b: Automaton) -> str | None:
    alphabet = sorted(set(a.alphabet) | set(b.alphabet))
    for w in all_words(alphabet, MAX_LEN):  # shortest first
        if accepts(a, w) != accepts(b, w):
            return w
    return None


@SETTINGS
@given(automata(), automata())
def test_agrees_with_brute_force_and_finds_a_shortest_counterexample(
    a: Automaton, b: Automaton
) -> None:
    r = check_equivalence(a, b)
    expected = shortest_difference(a, b)
    if r.equivalent:
        assert expected is None, f"claimed equivalent but {expected!r} differs"
    else:
        assert r.counterexample is not None
        w = r.counterexample
        # It really distinguishes the two automata, in the direction reported...
        assert accepts(a, w) == r.a_accepts and accepts(b, w) == r.b_accepts
        assert r.a_accepts != r.b_accepts
        # ...and nothing shorter does. (Brute force only looks up to MAX_LEN.)
        if expected is not None:
            assert len(w) == len(expected)
        else:
            assert len(w) > MAX_LEN


@SETTINGS
@given(automata(), automata())
def test_symmetric(a: Automaton, b: Automaton) -> None:
    ab, ba = check_equivalence(a, b), check_equivalence(b, a)
    assert ab.equivalent == ba.equivalent
    if not ab.equivalent:
        assert ab.counterexample == ba.counterexample  # same word, roles swapped
        assert (ab.a_accepts, ab.b_accepts) == (ba.b_accepts, ba.a_accepts)


@SETTINGS
@given(automata())
def test_every_automaton_equals_its_dfa_and_minimal_dfa(n: Automaton) -> None:
    dfa = nfa_to_dfa(n).automaton
    assert check_equivalence(n, dfa).equivalent
    assert check_equivalence(n, minimize(dfa).automaton).equivalent


@SETTINGS
@given(st.data())
def test_flipping_one_accepting_state_is_detected(data: st.DataObject) -> None:
    n = data.draw(automata())
    dfa = nfa_to_dfa(n).automaton
    victim = data.draw(st.sampled_from(dfa.states))
    flipped = type(dfa)(
        kind=dfa.kind,
        alphabet=dfa.alphabet,
        states=dfa.states,
        start=dfa.start,
        accepting=dfa.accepting ^ {victim},
        transitions=dfa.transitions,
    )
    r = check_equivalence(dfa, flipped)
    # If the flipped state is reachable (all DFA states from subset construction are), the
    # languages differ, and the checker must say so with a valid witness.
    assert not r.equivalent
    assert r.counterexample is not None
    assert accepts(dfa, r.counterexample) != accepts(flipped, r.counterexample)
