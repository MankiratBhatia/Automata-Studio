from __future__ import annotations

from collections.abc import Iterable

from automata_core.model import Automaton


def epsilon_closure(a: Automaton, states: Iterable[str]) -> frozenset[str]:
    """All states reachable from `states` using only epsilon transitions (cycle-safe)."""
    seen = set(states)
    stack = list(seen)
    while stack:
        s = stack.pop()
        for _, t in a.outgoing(s):
            if t.symbol is None and t.dst not in seen:
                seen.add(t.dst)
                stack.append(t.dst)
    return frozenset(seen)


def move(a: Automaton, states: Iterable[str], symbol: str) -> frozenset[str]:
    """States reachable from `states` by exactly one transition labelled `symbol`."""
    return frozenset(t.dst for s in states for _, t in a.outgoing(s) if t.symbol == symbol)


def epsilon_edges(a: Automaton, states: Iterable[str]) -> tuple[int, ...]:
    """Indices of epsilon transitions leaving `states` (the edges a closure follows).

    Sorted, because `states` is usually a set whose iteration order varies between runs.
    """
    return tuple(sorted(i for s in states for i, t in a.outgoing(s) if t.symbol is None))
