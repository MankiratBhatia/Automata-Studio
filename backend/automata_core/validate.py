from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Literal

from automata_core.errors import InvalidAutomatonError
from automata_core.model import Automaton

Severity = Literal["error", "warning"]


@dataclass(frozen=True)
class Issue:
    severity: Severity
    code: str
    message: str
    state_ids: tuple[str, ...] = ()
    transition_indices: tuple[int, ...] = ()


def has_errors(issues: list[Issue]) -> bool:
    return any(i.severity == "error" for i in issues)


def require_valid(a: Automaton) -> None:
    """Raise InvalidAutomatonError unless `a` is free of validation *errors* (warnings are fine)."""
    errors = [i for i in validate(a) if i.severity == "error"]
    if errors:
        raise InvalidAutomatonError(errors)


def validate(a: Automaton) -> list[Issue]:
    """Report structural problems. Errors come first, then warnings; order is deterministic."""
    issues: list[Issue] = []
    state_set = set(a.states)
    alphabet = set(a.alphabet)

    def err(code: str, msg: str, states: tuple[str, ...] = (), trans: tuple[int, ...] = ()) -> None:
        issues.append(Issue("error", code, msg, states, trans))

    def warn(
        code: str, msg: str, states: tuple[str, ...] = (), trans: tuple[int, ...] = ()
    ) -> None:
        issues.append(Issue("warning", code, msg, states, trans))

    # --- errors -------------------------------------------------------------------------
    start_ok = a.start is not None and a.start in state_set
    if a.start is None:
        err("NO_START", "No start state is set.")
    elif a.start not in state_set:
        err("NO_START", f"Start state '{a.start}' does not exist.")

    for s in sorted(a.accepting - state_set):
        err("DANGLING_REF", f"Accepting state '{s}' does not exist.")

    valid: set[int] = set()  # indices of transitions whose endpoints exist
    for i, t in enumerate(a.transitions):
        missing = tuple(dict.fromkeys(x for x in (t.src, t.dst) if x not in state_set))
        if missing:
            err(
                "DANGLING_REF",
                f"Transition {t.src} -> {t.dst} refers to missing state(s): {', '.join(missing)}.",
                trans=(i,),
            )
        else:
            valid.add(i)
        if t.symbol is None:
            if a.kind != "ENFA":
                err(
                    "EPSILON_NOT_ALLOWED",
                    f"Epsilon transition {t.src} -> {t.dst} is not allowed in a {a.kind}.",
                    tuple(x for x in (t.src, t.dst) if x in state_set),
                    (i,),
                )
        elif t.symbol not in alphabet:
            err(
                "UNKNOWN_SYMBOL",
                f"Transition {t.src} -> {t.dst} uses '{t.symbol}', which is not in the alphabet.",
                tuple(x for x in (t.src, t.dst) if x in state_set),
                (i,),
            )

    by_key: dict[tuple[str, str], list[int]] = {}
    for i in sorted(valid):
        t = a.transitions[i]
        if t.symbol is not None:
            by_key.setdefault((t.src, t.symbol), []).append(i)
    for (src, sym), idxs in by_key.items():
        targets = [a.transitions[i].dst for i in idxs]
        if len(set(targets)) > 1 and a.kind == "DFA":
            err(
                "NONDETERMINISTIC",
                f"State '{src}' has several transitions on '{sym}' "
                f"(to {', '.join(sorted(set(targets)))}), which a DFA does not allow.",
                (src,),
                tuple(idxs),
            )
        elif len(targets) != len(set(targets)):
            warn(
                "DUPLICATE_TRANSITION",
                f"State '{src}' has the same transition on '{sym}' more than once.",
                (src,),
                tuple(idxs),
            )

    # --- warnings -----------------------------------------------------------------------
    if not a.alphabet:
        warn("EMPTY_ALPHABET", "The alphabet is empty.")

    if a.kind == "DFA":
        for s in a.states:
            absent = [c for c in a.alphabet if (s, c) not in by_key]
            if absent:
                warn(
                    "INCOMPLETE_DFA",
                    f"State '{s}' has no transition on: {', '.join(absent)}.",
                    (s,),
                )

    accepting_ok = a.accepting & state_set
    if not accepting_ok:
        warn("NO_ACCEPTING", "No accepting state: the language is empty.")

    if start_ok:
        assert a.start is not None
        reachable = _reachable(a, valid, a.start)
        unreachable = tuple(s for s in a.states if s not in reachable)
        if unreachable:
            warn(
                "UNREACHABLE",
                f"Unreachable from the start state: {', '.join(unreachable)}.",
                unreachable,
            )
        live = _can_reach_accepting(a, valid, accepting_ok)
        dead = tuple(
            s for s in a.states if s in reachable and s not in live and not _is_trap(a, s, alphabet)
        )
        if dead:
            warn(
                "DEAD_STATE",
                f"No accepting state can be reached from: {', '.join(dead)}.",
                dead,
            )

    issues.sort(key=lambda i: i.severity != "error")  # stable: errors first
    return issues


def _reachable(a: Automaton, valid: set[int], start: str) -> set[str]:
    seen = {start}
    queue = deque([start])
    while queue:
        s = queue.popleft()
        for i, t in a.outgoing(s):
            if i in valid and t.dst not in seen:
                seen.add(t.dst)
                queue.append(t.dst)
    return seen


def _can_reach_accepting(a: Automaton, valid: set[int], accepting: frozenset[str]) -> set[str]:
    reverse: dict[str, list[str]] = {}
    for i in sorted(valid):
        t = a.transitions[i]
        reverse.setdefault(t.dst, []).append(t.src)
    seen = set(accepting)
    queue = deque(seen)
    while queue:
        s = queue.popleft()
        for p in reverse.get(s, []):
            if p not in seen:
                seen.add(p)
                queue.append(p)
    return seen


def _is_trap(a: Automaton, state: str, alphabet: set[str]) -> bool:
    """An intentional trap: non-accepting, every alphabet symbol loops back to itself."""
    out = a.outgoing(state)
    if state in a.accepting or any(t.dst != state for _, t in out):
        return False
    return alphabet <= {t.symbol for _, t in out}
