from __future__ import annotations

from collections.abc import Sequence

from automata_core.model import Automaton, Kind, Transition

Edge = tuple[str, str | None, str]  # (src, symbol or None for epsilon, dst)


def make(
    kind: Kind,
    start: str | None,
    accepting: Sequence[str],
    edges: Sequence[Edge],
    *,
    alphabet: Sequence[str] | None = None,
    states: Sequence[str] | None = None,
) -> Automaton:
    """Compact automaton builder. States/alphabet are inferred unless given explicitly."""
    if states is None:
        found: list[str] = [start] if start is not None else []
        for s, _, d in edges:
            found += [s, d]
        found += accepting
        states = list(dict.fromkeys(found))
    if alphabet is None:
        alphabet = list(dict.fromkeys(c for _, c, _ in edges if c is not None))
    return Automaton(
        kind=kind,
        alphabet=tuple(alphabet),
        states=tuple(states),
        start=start,
        accepting=frozenset(accepting),
        transitions=tuple(Transition(s, d, c) for s, c, d in edges),
    )


# --- language-level helpers used by the conversion tests --------------------------------


def all_words(alphabet: Sequence[str], max_len: int) -> list[str]:
    """Every word over `alphabet` up to `max_len` symbols, shortest first."""
    import itertools

    out = [""]
    for n in range(1, max_len + 1):
        out += ["".join(p) for p in itertools.product(alphabet, repeat=n)]
    return out


def language(a: Automaton, alphabet: Sequence[str], max_len: int = 6) -> frozenset[str]:
    """The words up to `max_len` that `a` accepts (checked with the real simulator)."""
    from automata_core.simulate import simulate_batch

    words = all_words(alphabet, max_len)
    results = simulate_batch(a, words)
    return frozenset(w for w, r in zip(words, results, strict=True) if r.accepted)


def canon(dfa: Automaton) -> tuple[tuple[bool, ...], tuple[tuple[int, ...], ...]]:
    """Name-independent form of a complete DFA: states numbered by BFS from the start.

    Two complete DFAs are isomorphic exactly when their canonical forms are equal, which is
    how we check that minimal DFAs are unique.
    """
    from collections import deque

    assert dfa.start is not None
    index = {dfa.start: 0}
    queue = deque([dfa.start])
    rows: list[tuple[int, ...]] = []
    flags: list[bool] = []
    while queue:
        s = queue.popleft()
        flags.append(s in dfa.accepting)
        nxt = {t.symbol: t.dst for _, t in dfa.outgoing(s)}
        row = []
        for c in dfa.alphabet:
            d = nxt[c]  # KeyError here means the DFA was not complete
            if d not in index:
                index[d] = len(index)
                queue.append(d)
            row.append(index[d])
        rows.append(tuple(row))
    return tuple(flags), tuple(rows)
