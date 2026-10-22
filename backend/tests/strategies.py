"""Hypothesis strategies shared by the property tests."""

from hypothesis import strategies as st

from automata_core.model import Automaton, Kind
from tests.helpers import make


@st.composite
def automata(
    draw: st.DrawFn, kinds: tuple[Kind, ...] = ("NFA", "ENFA"), max_states: int = 5
) -> Automaton:
    """A random NFA / epsilon-NFA over a small alphabet. Always structurally valid."""
    n = draw(st.integers(1, max_states))
    names = [f"q{i}" for i in range(n)]
    alphabet = draw(st.sampled_from([["a"], ["a", "b"], ["a", "b", "c"]]))
    kind: Kind = draw(st.sampled_from(list(kinds)))
    symbols: list[str | None] = [*alphabet, None] if kind == "ENFA" else list(alphabet)
    edge = st.tuples(st.sampled_from(names), st.sampled_from(symbols), st.sampled_from(names))
    edges = draw(st.lists(edge, max_size=14))
    accepting = draw(st.lists(st.sampled_from(names), unique=True))
    start = draw(st.sampled_from(names))
    return make(kind, start, accepting, edges, alphabet=alphabet, states=names)


_leaf = st.sampled_from(["a", "b", "ε"])

# Fully parenthesised, so the string means the same thing to our parser and to Python's `re`
# (after translating ε). Precedence is covered by hand-written tests instead.
regexes = st.recursive(
    _leaf,
    lambda inner: st.one_of(
        st.tuples(inner, inner).map(lambda t: f"({t[0]}|{t[1]})"),
        st.tuples(inner, inner).map(lambda t: f"({t[0]}{t[1]})"),
        inner.map(lambda x: f"({x})*"),
        inner.map(lambda x: f"({x})+"),
        inner.map(lambda x: f"({x})?"),
    ),
    max_leaves=8,
)


def to_python_regex(pattern: str) -> str:
    return pattern.replace("ε", "(?:)").replace("∅", "(?!)")
