"""Compare the engine against an independent brute-force oracle on random automata."""

from hypothesis import given, settings
from hypothesis import strategies as st

from automata_core.model import Automaton
from automata_core.simulate import simulate
from automata_core.validate import has_errors, validate
from tests.strategies import automata


def oracle(a: Automaton, word: str) -> bool:
    """Depth-first search over (state, position) configurations. Shares no code with the engine."""
    assert a.start is not None
    seen: set[tuple[str, int]] = set()
    stack = [(a.start, 0)]
    while stack:
        state, i = stack.pop()
        if (state, i) in seen:
            continue
        seen.add((state, i))
        if i == len(word) and state in a.accepting:
            return True
        for t in a.transitions:
            if t.src != state:
                continue
            if t.symbol is None:
                stack.append((t.dst, i))
            elif i < len(word) and word[i] == t.symbol:
                stack.append((t.dst, i + 1))
    return False


@st.composite
def automata_and_words(draw: st.DrawFn) -> tuple[Automaton, list[str]]:
    a = draw(automata())
    words = draw(
        st.lists(st.text(alphabet="".join(a.alphabet), max_size=7), min_size=1, max_size=8)
    )
    return a, words


@settings(max_examples=300, deadline=None)
@given(automata_and_words())
def test_simulate_matches_oracle(case: tuple[Automaton, list[str]]) -> None:
    a, words = case
    assert not has_errors(validate(a))
    for w in words:
        assert simulate(a, w).accepted == oracle(a, w), (a, w)


@settings(max_examples=200, deadline=None)
@given(automata_and_words())
def test_trace_invariants(case: tuple[Automaton, list[str]]) -> None:
    a, words = case
    for w in words:
        t = simulate(a, w)
        assert [s.index for s in t.steps] == list(range(len(t.steps)))
        if not t.stuck:
            assert len(t.steps) == len(w) + 1
            assert t.accepted == any(s in a.accepting for s in t.steps[-1].states)
        else:
            assert not t.accepted and t.steps[-1].states == ()
