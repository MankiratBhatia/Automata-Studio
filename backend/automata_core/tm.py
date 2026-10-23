"""Deterministic single-tape Turing machines: validation and a simulator.

The tape is unbounded in both directions and stored sparsely (only non-blank cells), so the head
may walk left past the start of the input. Cell 0 holds the first input symbol.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from automata_core.errors import InputSymbolError, InvalidAutomatonError
from automata_core.validate import Issue, has_errors

Move = Literal["L", "R", "S"]
Status = Literal["accepted", "rejected", "limit"]

MAX_STEPS = 10_000
_DELTA: dict[str, int] = {"L": -1, "R": 1, "S": 0}


@dataclass(frozen=True)
class TmTransition:
    src: str
    dst: str
    read: str
    write: str
    move: str  # "L", "R" or "S" (stay)


@dataclass(frozen=True)
class Tm:
    states: tuple[str, ...]
    input_alphabet: tuple[str, ...]
    tape_alphabet: tuple[str, ...]
    blank: str
    start: str | None
    accepting: frozenset[str]
    rejecting: frozenset[str]
    transitions: tuple[TmTransition, ...]
    name: str = ""

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> Tm:
        """Build from the JSON shape used by the API and the example files."""
        return cls(
            states=tuple(s["id"] for s in data["states"]),
            input_alphabet=tuple(data["inputAlphabet"]),
            tape_alphabet=tuple(data["tapeAlphabet"]),
            blank=data["blank"],
            start=data["start"],
            accepting=frozenset(data["accepting"]),
            rejecting=frozenset(data["rejecting"]),
            transitions=tuple(
                TmTransition(t["from"], t["to"], t["read"], t["write"], t["move"])
                for t in data["transitions"]
            ),
            name=data.get("name", ""),
        )


@dataclass(frozen=True)
class TmStep:
    index: int
    state: str  # state after this step
    head: int  # head position after this step
    transition: int | None  # None for the start
    read: str | None  # what the move read (at the head's previous position)
    write: str | None
    cell: int | None  # the cell that was written (the head's previous position)
    note: str


@dataclass(frozen=True)
class TmRun:
    status: Status
    steps: tuple[TmStep, ...]
    # The non-blank part of the final tape, from its first to its last non-blank cell.
    output: str
    reason: str


def describe(t: TmTransition) -> str:
    return f"δ({t.src}, {t.read}) → ({t.dst}, write {t.write}, move {t.move})"


def validate_tm(tm: Tm) -> list[Issue]:
    """Structural problems. Errors come first, then warnings."""
    issues: list[Issue] = []
    known = set(tm.states)
    tape = set(tm.tape_alphabet)

    def err(code: str, msg: str, states: tuple[str, ...] = (), trans: tuple[int, ...] = ()) -> None:
        issues.append(Issue("error", code, msg, states, trans))

    def warn(
        code: str, msg: str, states: tuple[str, ...] = (), trans: tuple[int, ...] = ()
    ) -> None:
        issues.append(Issue("warning", code, msg, states, trans))

    if tm.start is None:
        err("NO_START", "No start state is set.")
    elif tm.start not in known:
        err("NO_START", f"Start state '{tm.start}' does not exist.")
    for label, group in (("Accepting", tm.accepting), ("Rejecting", tm.rejecting)):
        for s in sorted(group - known):
            err("DANGLING_REF", f"{label} state '{s}' does not exist.")
    both = tuple(s for s in tm.states if s in tm.accepting and s in tm.rejecting)
    if both:
        err(
            "ACCEPT_AND_REJECT",
            f"A state cannot be both accepting and rejecting: {', '.join(both)}.",
            both,
        )

    if tm.blank not in tape:
        err("BLANK_NOT_ON_TAPE", f"The blank symbol '{tm.blank}' must be in the tape alphabet.")
    if tm.blank in tm.input_alphabet:
        err("BLANK_IN_INPUT", f"The blank symbol '{tm.blank}' cannot be an input symbol.")
    missing_input = [c for c in tm.input_alphabet if c not in tape]
    if missing_input:
        err(
            "INPUT_NOT_ON_TAPE",
            f"Input symbols must also be tape symbols: {', '.join(missing_input)}.",
        )

    usable: list[int] = []
    for i, t in enumerate(tm.transitions):
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
        for what, sym in (("reads", t.read), ("writes", t.write)):
            if sym not in tape:
                err(
                    "UNKNOWN_SYMBOL",
                    f"Transition {t.src} → {t.dst} {what} '{sym}', "
                    "which is not in the tape alphabet.",
                    here,
                    (i,),
                )

    by_key: dict[tuple[str, str], list[int]] = {}
    for i in usable:
        t = tm.transitions[i]
        by_key.setdefault((t.src, t.read), []).append(i)
    for (src, read), idxs in by_key.items():
        if len(idxs) > 1:
            err(
                "NONDETERMINISTIC",
                f"State '{src}' has several moves on '{read}'; "
                "a Turing machine here must be deterministic.",
                (src,),
                tuple(idxs),
            )

    halting = tm.accepting | tm.rejecting
    for i in usable:
        t = tm.transitions[i]
        if t.src in halting:
            warn(
                "FROM_HALTING_STATE",
                f"'{t.src}' halts the machine, so this move is never used.",
                (t.src,),
                (i,),
            )
    if not (tm.accepting & known):
        warn("NO_ACCEPTING", "No accepting state: the machine can never accept.")

    if tm.start in known:
        reach = {tm.start}
        queue = deque([tm.start])
        while queue:
            s = queue.popleft()
            if s in halting:
                continue
            for i in usable:
                t = tm.transitions[i]
                if t.src == s and t.dst not in reach:
                    reach.add(t.dst)
                    queue.append(t.dst)
        gone = tuple(s for s in tm.states if s not in reach)
        if gone:
            warn("UNREACHABLE", f"Unreachable from the start state: {', '.join(gone)}.", gone)

    issues.sort(key=lambda i: i.severity != "error")
    return issues


def run_tm(tm: Tm, word: str, max_steps: int = MAX_STEPS) -> TmRun:
    """Run the machine on `word` for at most `max_steps` moves.

    The run ends when the machine enters an accepting or rejecting state, or has no move for the
    symbol under its head (which rejects). If it is still going after `max_steps` moves the
    status is "limit": it may halt later or may run forever; there is no way to tell in general.
    """
    issues = validate_tm(tm)
    if has_errors(issues):
        raise InvalidAutomatonError([i for i in issues if i.severity == "error"])
    alphabet = set(tm.input_alphabet)
    for pos, ch in enumerate(word):
        if ch not in alphabet:
            raise InputSymbolError(ch, pos)
    assert tm.start is not None

    delta = {(t.src, t.read): (i, t) for i, t in enumerate(tm.transitions)}
    tape: dict[int, str] = dict(enumerate(word))  # input symbols are never blank
    state, head = tm.start, 0
    steps = [TmStep(0, state, head, None, None, None, None, "Start")]

    def output() -> str:
        cells = [i for i, s in tape.items() if s != tm.blank]
        if not cells:
            return ""
        return "".join(tape.get(i, tm.blank) for i in range(min(cells), max(cells) + 1))

    for taken in range(max_steps + 1):
        if state in tm.accepting:
            return TmRun("accepted", tuple(steps), output(), f"entered the accepting state {state}")
        if state in tm.rejecting:
            return TmRun("rejected", tuple(steps), output(), f"entered the rejecting state {state}")
        if taken == max_steps:
            break
        symbol = tape.get(head, tm.blank)
        move = delta.get((state, symbol))
        if move is None:
            return TmRun(
                "rejected",
                tuple(steps),
                output(),
                f"no transition from {state} on '{symbol}'",
            )
        index, t = move
        if t.write == tm.blank:
            tape.pop(head, None)  # keep the tape sparse
        else:
            tape[head] = t.write
        cell = head
        head += _DELTA[t.move]
        state = t.dst
        steps.append(TmStep(len(steps), state, head, index, symbol, t.write, cell, describe(t)))

    return TmRun(
        "limit",
        tuple(steps),
        output(),
        f"stopped after {max_steps} steps without halting",
    )
