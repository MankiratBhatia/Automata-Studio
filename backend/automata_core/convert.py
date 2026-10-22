"""Epsilon removal and subset construction."""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable

from automata_core.closure import epsilon_closure, epsilon_edges, move
from automata_core.errors import LimitExceededError
from automata_core.model import Automaton, Transition
from automata_core.steps import Conversion, Step
from automata_core.validate import require_valid

# Subset construction is exponential in the worst case; refuse rather than hang the server.
MAX_DFA_STATES = 512


def _fmt(states: Iterable[str]) -> str:
    items = list(states)
    return "{" + ", ".join(items) + "}" if items else "∅"


def remove_epsilon(a: Automaton) -> Conversion:
    """Epsilon-NFA -> NFA with the same language.

    delta'(q, c) = move(closure(q), c); q is accepting when closure(q) holds an accepting
    state. No trailing closure is needed: the next step starts from closure(target) anyway, so
    states that were only ever entered by epsilon edges become unreachable and are dropped.
    """
    require_valid(a)
    order = {s: i for i, s in enumerate(a.states)}

    def ordered(states: Iterable[str]) -> list[str]:
        return sorted(states, key=order.__getitem__)

    transitions: list[Transition] = []
    accepting: set[str] = set()
    steps: list[Step] = []
    for s in a.states:
        closure = epsilon_closure(a, {s})
        reads: list[str] = []
        used: set[int] = set(epsilon_edges(a, closure))
        for c in a.alphabet:
            targets = move(a, closure, c)
            for t in ordered(targets):
                transitions.append(Transition(s, t, c))
            if targets:
                reads.append(f"on '{c}' → {_fmt(ordered(targets))}")
                used |= {i for q in closure for i, t in a.outgoing(q) if t.symbol == c}
        if closure & a.accepting:
            accepting.add(s)
        detail = f"ε-closure({s}) = {_fmt(ordered(closure))}."
        if reads:
            detail += " " + "; ".join(reads) + "."
        if s in accepting:
            detail += f" {s} is accepting: its closure contains an accepting state."
        steps.append(
            Step(len(steps), f"State {s}", detail, tuple(ordered(closure)), tuple(sorted(used)))
        )

    # Keep only states reachable from the start.
    assert a.start is not None
    out: dict[str, list[str]] = {}
    for tr in transitions:
        out.setdefault(tr.src, []).append(tr.dst)
    reachable = {a.start}
    queue = deque([a.start])
    while queue:
        for d in out.get(queue.popleft(), []):
            if d not in reachable:
                reachable.add(d)
                queue.append(d)
    kept = tuple(s for s in a.states if s in reachable)
    dropped = [s for s in a.states if s not in reachable]

    steps.append(
        Step(
            len(steps),
            "Done",
            f"Kept {len(kept)} of {len(a.states)} states"
            + (f"; removed unreachable: {', '.join(dropped)}." if dropped else "."),
        )
    )
    result = Automaton(
        kind="NFA",
        alphabet=a.alphabet,
        states=kept,
        start=a.start,
        accepting=frozenset(accepting & reachable),
        transitions=tuple(t for t in transitions if t.src in reachable),
        name=f"{a.name} (no ε)" if a.name else "",
    )
    return Conversion(result, tuple(steps))


def nfa_to_dfa(a: Automaton, limit: int = MAX_DFA_STATES) -> Conversion:
    """Subset construction for an NFA or epsilon-NFA.

    Builds only the reachable subsets, so it is lazy. The result is a complete DFA: the empty
    subset becomes an explicit trap state "∅". Raises LimitExceededError past `limit` states.
    """
    require_valid(a)
    assert a.start is not None
    order = {s: i for i, s in enumerate(a.states)}

    def key(states: Iterable[str]) -> tuple[str, ...]:
        return tuple(sorted(set(states), key=order.__getitem__))

    def ident(subset: tuple[str, ...]) -> str:
        return "{" + ",".join(subset) + "}" if subset else "∅"

    start = key(epsilon_closure(a, {a.start}))
    ids: dict[tuple[str, ...], str] = {start: ident(start)}
    queue: deque[tuple[str, ...]] = deque([start])
    transitions: list[Transition] = []
    steps = [
        Step(
            0,
            "Start",
            f"The DFA starts in the ε-closure of {{{a.start}}} = {_fmt(start)}, "
            f"written {ids[start]}.",
            start,
            epsilon_edges(a, start),
            adds_states=(ids[start],),
        )
    ]

    while queue:
        subset = queue.popleft()
        for c in a.alphabet:
            edges = tuple(sorted(i for s in subset for i, t in a.outgoing(s) if t.symbol == c))
            moved = move(a, subset, c)
            target = key(epsilon_closure(a, moved))
            is_new = target not in ids
            if is_new:
                if len(ids) >= limit:
                    raise LimitExceededError(limit)
                ids[target] = ident(target)
                queue.append(target)
            transitions.append(Transition(ids[subset], ids[target], c))
            steps.append(
                Step(
                    len(steps),
                    f"{ids[subset]} on '{c}'",
                    f"move = {_fmt(key(moved))}; ε-closure = {_fmt(target)} → "
                    f"{'new' if is_new else 'existing'} state {ids[target]}",
                    subset,
                    edges,
                    adds_states=(ids[target],) if is_new else (),
                    adds_transitions=(len(transitions) - 1,),
                )
            )

    accepting = frozenset(ids[s] for s in ids if set(s) & a.accepting)
    steps.append(
        Step(
            len(steps),
            "Done",
            f"{len(ids)} DFA states from {len(a.states)} NFA states; {len(accepting)} accepting.",
        )
    )
    dfa = Automaton(
        kind="DFA",
        alphabet=a.alphabet,
        states=tuple(ids.values()),
        start=ids[start],
        accepting=accepting,
        transitions=tuple(transitions),
        name=f"{a.name} (DFA)" if a.name else "",
    )
    return Conversion(dfa, tuple(steps), state_map={v: k for k, v in ids.items()})
