"""DFA minimisation by partition refinement (Moore's algorithm)."""

from __future__ import annotations

from collections import deque

from automata_core.errors import WrongKindError
from automata_core.model import Automaton, Transition
from automata_core.steps import Conversion, Step
from automata_core.validate import require_valid


def _fresh(used: set[str], base: str) -> str:
    name, n = base, 1
    while name in used:
        n += 1
        name = f"{base}{n}"
    return name


def _fmt(states: tuple[str, ...] | list[str]) -> str:
    return "{" + ", ".join(states) + "}"


def minimize(a: Automaton) -> Conversion:
    """Return the unique smallest complete DFA with the same language.

    1. Drop states unreachable from the start; add a trap state if any transition is missing.
    2. Start with {accepting, non-accepting} and repeatedly split any block whose members
       send some symbol to different blocks, until nothing changes.
    3. Each final block becomes one state. Merged states are named "p=q".
    """
    if a.kind != "DFA":
        raise WrongKindError("DFA", a.kind)
    require_valid(a)
    assert a.start is not None

    delta: dict[tuple[str, str], str] = {}
    for t in a.transitions:
        if t.symbol is not None:
            delta[(t.src, t.symbol)] = t.dst

    # Step 1: reachable states, then completion.
    reachable = {a.start}
    queue = deque([a.start])
    while queue:
        s = queue.popleft()
        for c in a.alphabet:
            d = delta.get((s, c))
            if d is not None and d not in reachable:
                reachable.add(d)
                queue.append(d)
    states = [s for s in a.states if s in reachable]
    removed = [s for s in a.states if s not in reachable]

    notes: list[str] = []
    if removed:
        notes.append(f"Removed unreachable states: {', '.join(removed)}.")
    if any((s, c) not in delta for s in states for c in a.alphabet):
        trap = _fresh(set(a.states), "∅")
        for s in states:
            for c in a.alphabet:
                delta.setdefault((s, c), trap)
        for c in a.alphabet:
            delta[(trap, c)] = trap
        states.append(trap)
        notes.append(f"Added trap state {trap} for the missing transitions.")
    if not notes:
        notes.append("Already complete, with no unreachable states.")
    steps = [Step(0, "Prepare", " ".join(notes), tuple(removed))]

    # Step 2: Moore's refinement. Blocks are tuples of states in the automaton's own order.
    accepting = {s for s in states if s in a.accepting}

    def initial() -> list[tuple[str, ...]]:
        groups = [
            tuple(s for s in states if s in accepting),
            tuple(s for s in states if s not in accepting),
        ]
        return [g for g in groups if g]

    blocks = initial()
    block_of = {s: i for i, b in enumerate(blocks) for s in b}
    rounds = [tuple(blocks)]
    steps.append(
        Step(
            len(steps),
            "Initial partition",
            "Accepting vs non-accepting: " + " | ".join(_fmt(b) for b in blocks) + ".",
            tuple(states),
            round=0,
        )
    )

    k = 0
    while True:
        groups: dict[tuple[int, tuple[int, ...]], list[str]] = {}
        for s in states:
            sig = (block_of[s], tuple(block_of[delta[(s, c)]] for c in a.alphabet))
            groups.setdefault(sig, []).append(s)
        refined = [tuple(g) for g in groups.values()]
        if len(refined) == len(blocks):
            break
        k += 1
        splits: list[str] = []
        touched: list[str] = []
        for old_index, old in enumerate(blocks):
            parts = [b for b in refined if block_of[b[0]] == old_index]
            if len(parts) > 1:
                x, y = parts[0][0], parts[1][0]
                why = next(
                    c for c in a.alphabet if block_of[delta[(x, c)]] != block_of[delta[(y, c)]]
                )
                splits.append(
                    f"{_fmt(old)} splits into {' | '.join(_fmt(p) for p in parts)} "
                    f"(different targets on '{why}')"
                )
                touched += old
        blocks = refined
        block_of = {s: i for i, b in enumerate(blocks) for s in b}
        rounds.append(tuple(blocks))
        steps.append(
            Step(len(steps), f"Round {k}", "; ".join(splits) + ".", tuple(touched), round=k)
        )

    steps.append(
        Step(
            len(steps),
            "Done",
            f"Stable after {k} refinement round{'s' if k != 1 else ''}: "
            f"{len(blocks)} equivalent-state class{'es' if len(blocks) != 1 else ''}.",
            round=k,
        )
    )

    # Step 3: build the quotient automaton, numbering blocks in BFS order from the start.
    def name(block: int) -> str:
        return "=".join(blocks[block])

    start_block = block_of[a.start]
    order = [start_block]
    seen = {start_block}
    bfs = deque([start_block])
    transitions: list[Transition] = []
    while bfs:
        b = bfs.popleft()
        for c in a.alphabet:
            target = block_of[delta[(blocks[b][0], c)]]
            transitions.append(Transition(name(b), name(target), c))
            if target not in seen:
                seen.add(target)
                order.append(target)
                bfs.append(target)

    result = Automaton(
        kind="DFA",
        alphabet=a.alphabet,
        states=tuple(name(b) for b in order),
        start=name(start_block),
        accepting=frozenset(name(b) for b in order if blocks[b][0] in accepting),
        transitions=tuple(transitions),
        name=f"{a.name} (minimal)" if a.name else "",
    )
    return Conversion(
        result,
        tuple(steps),
        state_map={name(b): blocks[b] for b in order},
        rounds=tuple(rounds),
    )
