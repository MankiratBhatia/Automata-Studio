"""Helpers for the PDA and Turing machine tests: fixtures, predicates and independent checkers."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from automata_core.pda import Pda, PdaRun
from automata_core.tm import Tm

MACHINE_DIR = Path(__file__).parent / "fixtures" / "machines"


def machine_json(name: str) -> dict[str, Any]:
    return json.loads((MACHINE_DIR / f"{name}.json").read_text(encoding="utf-8"))


def load_pda(name: str) -> Pda:
    return Pda.from_dict(machine_json(name))


def load_tm(name: str) -> Tm:
    return Tm.from_dict(machine_json(name))


def expectations() -> dict[str, dict[str, Any]]:
    return json.loads((MACHINE_DIR / "expectations.json").read_text(encoding="utf-8"))


# --- the languages the example machines are supposed to recognise ---------------------------


def anbn(w: str) -> bool:
    n = len(w) // 2
    return len(w) % 2 == 0 and w == "a" * n + "b" * n


def even_palindrome(w: str) -> bool:
    return len(w) % 2 == 0 and w == w[::-1]


def palindrome(w: str) -> bool:
    return w == w[::-1]


def balanced(w: str) -> bool:
    depth = 0
    for c in w:
        depth += 1 if c == "(" else -1
        if depth < 0:
            return False
    return depth == 0


def anbncn(w: str) -> bool:
    n = len(w) // 3
    return len(w) % 3 == 0 and w == "a" * n + "b" * n + "c" * n


PREDICATES: dict[str, Callable[[str], bool]] = {
    "pda_anbn_final": anbn,
    "pda_anbn_empty": anbn,
    "pda_palindromes": even_palindrome,
    "pda_balanced": balanced,
    "tm_anbncn": anbncn,
    "tm_palindromes": palindrome,
}


# --- independent trace checkers (they share no code with the engines) -----------------------


def check_pda_trace(p: Pda, word: str, run: PdaRun) -> None:
    """Every step of a trace must be a legal move from the step before it."""
    steps = run.steps
    first = steps[0]
    assert (first.state, first.position, first.stack) == (p.start, 0, p.start_stack)
    assert first.transition is None
    for prev, cur in zip(steps, steps[1:], strict=False):
        assert cur.transition is not None
        t = p.transitions[cur.transition]
        assert (t.src, t.dst) == (prev.state, cur.state)
        pos = prev.position
        if t.input is not None:
            assert pos < len(word) and word[pos] == t.input
            pos += 1
        assert cur.position == pos
        stack = prev.stack
        if t.pop is not None:
            assert stack.startswith(t.pop)
            stack = stack[1:]
        assert cur.stack == t.push + stack


def replay_tape(tm: Tm, word: str, steps: tuple) -> dict[int, str]:  # type: ignore[type-arg]
    """Rebuild the tape by applying each step's write, checking every step is a legal move."""
    tape = dict(enumerate(word))
    assert (steps[0].state, steps[0].head, steps[0].transition) == (tm.start, 0, None)
    for prev, cur in zip(steps, steps[1:], strict=False):
        t = tm.transitions[cur.transition]
        assert (t.src, t.dst) == (prev.state, cur.state)
        assert tape.get(prev.head, tm.blank) == t.read, "read the wrong symbol"
        tape[prev.head] = t.write
        assert cur.cell == prev.head and cur.write == t.write and cur.read == t.read
        assert cur.head == prev.head + {"L": -1, "R": 1, "S": 0}[t.move]
    return tape


def tape_text(tape: dict[int, str], blank: str) -> str:
    cells = [i for i, s in tape.items() if s != blank]
    if not cells:
        return ""
    return "".join(tape.get(i, blank) for i in range(min(cells), max(cells) + 1))
