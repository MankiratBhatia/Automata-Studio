"""Language equivalence of two automata, with a shortest counterexample."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, replace

from automata_core.convert import MAX_DFA_STATES, nfa_to_dfa
from automata_core.model import Automaton


@dataclass(frozen=True)
class EquivalenceResult:
    equivalent: bool
    # A shortest string accepted by exactly one automaton ("" is a real counterexample).
    counterexample: str | None
    # Whether each automaton accepts the counterexample; None when they are equivalent.
    a_accepts: bool | None
    b_accepts: bool | None
    # How many pairs of DFA states the search visited.
    explored: int


def check_equivalence(a: Automaton, b: Automaton, limit: int = MAX_DFA_STATES) -> EquivalenceResult:
    """Decide whether `a` and `b` accept the same language.

    1. Give both the union of their alphabets and turn each into a complete DFA (subset
       construction; a DFA input just gets completed with a trap state).
    2. Breadth-first search the product automaton from (start_a, start_b). A pair is a
       witness when exactly one side accepts.
    3. BFS visits pairs level by level, so the first witness found is at the smallest depth:
       its path spells a *shortest* counterexample (the alphabetically first among them).

    Raises InvalidAutomatonError for an invalid input and LimitExceededError if a subset
    construction would be too large.
    """
    alphabet = tuple(sorted(set(a.alphabet) | set(b.alphabet)))
    da = nfa_to_dfa(replace(a, alphabet=alphabet), limit).automaton
    db = nfa_to_dfa(replace(b, alphabet=alphabet), limit).automaton

    def table(d: Automaton) -> dict[tuple[str, str], str]:
        return {(t.src, t.symbol): t.dst for t in d.transitions if t.symbol is not None}

    ta, tb = table(da), table(db)
    assert da.start is not None and db.start is not None

    def differs(p: str, q: str) -> bool:
        return (p in da.accepting) != (q in db.accepting)

    start = (da.start, db.start)
    parent: dict[tuple[str, str], tuple[tuple[str, str], str] | None] = {start: None}

    def finish(pair: tuple[str, str]) -> EquivalenceResult:
        symbols: list[str] = []
        node = pair
        while (link := parent[node]) is not None:
            node, symbol = link
            symbols.append(symbol)
        return EquivalenceResult(
            False,
            "".join(reversed(symbols)),
            pair[0] in da.accepting,
            pair[1] in db.accepting,
            len(parent),
        )

    if differs(*start):
        return finish(start)
    queue = deque([start])
    while queue:
        p, q = queue.popleft()
        for c in alphabet:
            nxt = (ta[(p, c)], tb[(q, c)])
            if nxt in parent:
                continue
            parent[nxt] = ((p, q), c)
            # Checking on discovery (not on dequeue) still finds the shallowest witness,
            # because BFS discovers pairs in order of depth.
            if differs(*nxt):
                return finish(nxt)
            queue.append(nxt)
    return EquivalenceResult(True, None, None, None, len(parent))
