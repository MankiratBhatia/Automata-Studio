"""Pushdown automata: validation and a nondeterministic simulator.

A move reads one input symbol (or none, for epsilon), pops one stack symbol (or none), goes to a
new state and pushes a string of stack symbols. Stacks are written **top first**: pushing "AB"
puts A on top, with B directly beneath it.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from automata_core.errors import InputSymbolError, InvalidAutomatonError
from automata_core.validate import Issue, has_errors

AcceptBy = Literal["finalState", "emptyStack"]
Verdict = Literal["accepted", "rejected", "limit"]

# The search is exponential for some nondeterministic machines, and an epsilon-loop that pushes
# can grow forever, so both the number of configurations and the stack height are capped.
MAX_CONFIGS = 20_000
MAX_STACK = 200


@dataclass(frozen=True)
class PdaTransition:
    src: str
    dst: str
    input: str | None  # None is epsilon: read nothing
    pop: str | None  # None: pop nothing
    push: str  # top-first; "" pushes nothing


@dataclass(frozen=True)
class Pda:
    states: tuple[str, ...]
    input_alphabet: tuple[str, ...]
    stack_alphabet: tuple[str, ...]
    start: str | None
    start_stack: str  # one symbol, or "" for an initially empty stack
    accepting: frozenset[str]
    accept_by: AcceptBy
    transitions: tuple[PdaTransition, ...]
    name: str = ""

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> Pda:
        """Build from the JSON shape used by the API and the example files."""
        return cls(
            states=tuple(s["id"] for s in data["states"]),
            input_alphabet=tuple(data["inputAlphabet"]),
            stack_alphabet=tuple(data["stackAlphabet"]),
            start=data["start"],
            start_stack=data["startStack"],
            accepting=frozenset(data["accepting"]),
            accept_by=data["acceptBy"],
            transitions=tuple(
                PdaTransition(t["from"], t["to"], t["input"], t["pop"], t["push"])
                for t in data["transitions"]
            ),
            name=data.get("name", ""),
        )


@dataclass(frozen=True)
class PdaStep:
    index: int
    state: str
    position: int  # input symbols consumed so far
    stack: str  # top first
    transition: int | None  # index of the transition that led here; None for the start
    note: str


@dataclass(frozen=True)
class PdaRun:
    verdict: Verdict
    steps: tuple[PdaStep, ...]
    explored: int  # distinct configurations the search visited
    # True when `steps` is the closest attempt (it got furthest through the input) rather than
    # an accepting computation.
    closest: bool
    # Why the search stopped early, when verdict is "limit".
    reason: str = ""


def describe(t: PdaTransition) -> str:
    return f"δ({t.src}, {t.input or 'ε'}, {t.pop or 'ε'}) → ({t.dst}, {t.push or 'ε'})"


def validate_pda(p: Pda) -> list[Issue]:
    """Structural problems. Errors come first, then warnings."""
    issues: list[Issue] = []
    known = set(p.states)
    inputs = set(p.input_alphabet)
    stack = set(p.stack_alphabet)

    def err(code: str, msg: str, states: tuple[str, ...] = (), trans: tuple[int, ...] = ()) -> None:
        issues.append(Issue("error", code, msg, states, trans))

    def warn(
        code: str, msg: str, states: tuple[str, ...] = (), trans: tuple[int, ...] = ()
    ) -> None:
        issues.append(Issue("warning", code, msg, states, trans))

    if p.start is None:
        err("NO_START", "No start state is set.")
    elif p.start not in known:
        err("NO_START", f"Start state '{p.start}' does not exist.")
    for s in sorted(p.accepting - known):
        err("DANGLING_REF", f"Accepting state '{s}' does not exist.")
    if p.start_stack and p.start_stack not in stack:
        err(
            "UNKNOWN_STACK_SYMBOL",
            f"The initial stack symbol '{p.start_stack}' is not in the stack alphabet.",
        )

    usable: list[int] = []
    for i, t in enumerate(p.transitions):
        missing = tuple(dict.fromkeys(x for x in (t.src, t.dst) if x not in known))
        if missing:
            err(
                "DANGLING_REF",
                f"Transition {t.src} → {t.dst} refers to missing state(s): {', '.join(missing)}.",
                (),
                (i,),
            )
        else:
            usable.append(i)
        here = tuple(x for x in (t.src, t.dst) if x in known)
        if t.input is not None and t.input not in inputs:
            err(
                "UNKNOWN_INPUT_SYMBOL",
                f"Transition {t.src} → {t.dst} reads '{t.input}', "
                "which is not in the input alphabet.",
                here,
                (i,),
            )
        bad = [c for c in ([t.pop] if t.pop is not None else []) + list(t.push) if c not in stack]
        if bad:
            err(
                "UNKNOWN_STACK_SYMBOL",
                f"Transition {t.src} → {t.dst} uses '{bad[0]}', "
                "which is not in the stack alphabet.",
                here,
                (i,),
            )

    seen: dict[PdaTransition, list[int]] = {}
    for i in usable:
        seen.setdefault(p.transitions[i], []).append(i)
    for t, idxs in seen.items():
        if len(idxs) > 1:
            warn(
                "DUPLICATE_TRANSITION",
                f"The move {describe(t)} is listed more than once.",
                (t.src,),
                tuple(idxs),
            )

    if p.accept_by == "finalState" and not (p.accepting & known):
        warn("NO_ACCEPTING", "No accepting state: in final-state mode nothing can be accepted.")

    if p.start in known:
        reach = {p.start}
        queue = deque([p.start])
        while queue:
            s = queue.popleft()
            for i in usable:
                t = p.transitions[i]
                if t.src == s and t.dst not in reach:
                    reach.add(t.dst)
                    queue.append(t.dst)
        gone = tuple(s for s in p.states if s not in reach)
        if gone:
            warn("UNREACHABLE", f"Unreachable from the start state: {', '.join(gone)}.", gone)

    issues.sort(key=lambda i: i.severity != "error")
    return issues


def run_pda(
    p: Pda, word: str, max_configs: int = MAX_CONFIGS, max_stack: int = MAX_STACK
) -> PdaRun:
    """Search every computation on `word` (breadth first) for one that accepts.

    A *configuration* is (state, input consumed, stack). Because the search is breadth first,
    an accepting computation it finds is a shortest one. If none exists the machine rejects,
    unless a limit cut the search short, in which case the verdict is "limit": the answer is
    unknown, not "no".
    """
    issues = validate_pda(p)
    if has_errors(issues):
        raise InvalidAutomatonError([i for i in issues if i.severity == "error"])
    alphabet = set(p.input_alphabet)
    for pos, ch in enumerate(word):
        if ch not in alphabet:
            raise InputSymbolError(ch, pos)
    assert p.start is not None

    out: dict[str, list[tuple[int, PdaTransition]]] = {}
    for i, t in enumerate(p.transitions):
        out.setdefault(t.src, []).append((i, t))

    n = len(word)
    Config = tuple[str, int, str]

    def accepts(c: Config) -> bool:
        state, pos, stack = c
        if pos != n:
            return False
        return state in p.accepting if p.accept_by == "finalState" else stack == ""

    start: Config = (p.start, 0, p.start_stack)
    parent: dict[Config, tuple[Config, int] | None] = {start: None}
    furthest = start

    def trace(c: Config) -> tuple[PdaStep, ...]:
        # Walk back to the start. Each configuration is paired with the transition that led to it.
        chain: list[tuple[Config, int | None]] = []
        node: Config | None = c
        while node is not None:
            link = parent[node]
            chain.append((node, link[1] if link else None))
            node = link[0] if link else None
        chain.reverse()
        return tuple(
            PdaStep(
                k,
                cfg[0],
                cfg[1],
                cfg[2],
                t_index,
                "Start" if t_index is None else describe(p.transitions[t_index]),
            )
            for k, (cfg, t_index) in enumerate(chain)
        )

    if accepts(start):
        return PdaRun("accepted", trace(start), 1, False)

    # `reason` records that part of the search space was cut off. A too-tall stack only prunes
    # that one branch (other branches may still accept); running out of configurations ends it.
    reason = ""
    stop = False
    queue: deque[Config] = deque([start])
    while queue and not stop:
        cfg = queue.popleft()
        state, pos, stack = cfg
        for idx, t in out.get(state, []):
            npos = pos
            if t.input is not None:
                if pos >= n or word[pos] != t.input:
                    continue
                npos = pos + 1
            rest = stack
            if t.pop is not None:
                if not stack.startswith(t.pop):
                    continue
                rest = stack[1:]
            nstack = t.push + rest
            if len(nstack) > max_stack:
                reason = reason or f"a stack grew taller than {max_stack} symbols"
                continue
            nxt: Config = (t.dst, npos, nstack)
            if nxt in parent:
                continue
            if len(parent) >= max_configs:
                reason = f"the search reached {max_configs} configurations"
                stop = True
                break
            parent[nxt] = (cfg, idx)
            if accepts(nxt):
                return PdaRun("accepted", trace(nxt), len(parent), False)
            if nxt[1] > furthest[1]:
                furthest = nxt
            queue.append(nxt)

    return PdaRun("limit" if reason else "rejected", trace(furthest), len(parent), True, reason)
