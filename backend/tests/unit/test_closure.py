from automata_core.closure import epsilon_closure, epsilon_edges, move
from tests.helpers import make

CHAIN = make("ENFA", "a", ["c"], [("a", None, "b"), ("b", None, "c"), ("c", "x", "d")])
CYCLE = make("ENFA", "a", ["a"], [("a", None, "b"), ("b", None, "a"), ("b", "x", "c")])


def test_closure_includes_the_set_itself() -> None:
    assert epsilon_closure(CHAIN, {"d"}) == {"d"}


def test_closure_follows_chains() -> None:
    assert epsilon_closure(CHAIN, {"a"}) == {"a", "b", "c"}


def test_closure_ignores_symbol_transitions() -> None:
    assert "d" not in epsilon_closure(CHAIN, {"a"})


def test_closure_terminates_on_epsilon_cycle() -> None:
    assert epsilon_closure(CYCLE, {"a"}) == {"a", "b"}


def test_closure_of_empty_set_is_empty() -> None:
    assert epsilon_closure(CHAIN, set()) == frozenset()


def test_move_follows_exactly_one_symbol_step() -> None:
    assert move(CHAIN, {"a", "b", "c"}, "x") == {"d"}
    assert move(CHAIN, {"a"}, "x") == frozenset()


def test_move_never_follows_epsilon() -> None:
    assert move(CHAIN, {"a"}, "x") == frozenset()


def test_epsilon_edges_returns_transition_indices() -> None:
    assert epsilon_edges(CHAIN, {"a", "b", "c"}) == (0, 1)
    assert epsilon_edges(CHAIN, {"d"}) == ()
