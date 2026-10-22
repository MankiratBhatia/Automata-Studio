from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from automata_core.closure import epsilon_closure, epsilon_edges, move
from automata_core.errors import InputSymbolError
from automata_core.model import Automaton
from automata_core.steps import Step
from automata_core.validate import require_valid


@dataclass(frozen=True)
class SimStep(Step):
    """A simulation step. `states` is the set of active states after reading `position` symbols."""

    position: int = 0
    symbol: str | None = None  # symbol consumed to reach this step; None for the start step


@dataclass(frozen=True)
class Trace:
    accepted: bool
    steps: tuple[SimStep, ...]
    stuck: bool  # True if the run died (no active states) before the input was consumed


@dataclass(frozen=True)
class BatchResult:
    input: str
    accepted: bool | None  # None when the input could not be run
    error: str | None = None


def simulate(a: Automaton, word: str) -> Trace:
    """Run `word` through the automaton, tracking the full set of active states.

    One algorithm covers DFA, NFA and epsilon-NFA: a DFA simply never has more than one
    active state. Raises InvalidAutomatonError if validation reports errors, and
    InputSymbolError if `word` uses a symbol outside the alphabet.
    """
    require_valid(a)
    _require_symbols(a, word)
    return _run(a, word)


def simulate_batch(a: Automaton, words: Sequence[str]) -> list[BatchResult]:
    """Run many inputs. A bad input yields an error entry instead of failing the batch."""
    require_valid(a)
    results: list[BatchResult] = []
    for w in words:
        try:
            _require_symbols(a, w)
        except InputSymbolError as e:
            results.append(BatchResult(w, None, str(e)))
        else:
            results.append(BatchResult(w, _run(a, w).accepted))
    return results


def _require_symbols(a: Automaton, word: str) -> None:
    alphabet = set(a.alphabet)
    for pos, ch in enumerate(word):
        if ch not in alphabet:
            raise InputSymbolError(ch, pos)


def _run(a: Automaton, word: str) -> Trace:
    assert a.start is not None
    order = {s: i for i, s in enumerate(a.states)}

    def fmt(states: Iterable[str]) -> str:
        return "{" + ", ".join(sorted(states, key=order.__getitem__)) + "}"

    def ordered(states: Iterable[str]) -> tuple[str, ...]:
        return tuple(sorted(states, key=order.__getitem__))

    active = epsilon_closure(a, {a.start})
    eps_used = epsilon_edges(a, active)
    detail = (
        f"Start in {a.start}."
        if active == {a.start}
        else f"Start in {a.start}; epsilon-closure = {fmt(active)}."
    )
    steps = [SimStep(0, "Start", detail, ordered(active), eps_used, 0, None)]

    stuck = False
    for pos, ch in enumerate(word, start=1):
        sym_edges = tuple(sorted(i for s in active for i, t in a.outgoing(s) if t.symbol == ch))
        moved = move(a, active, ch)
        if not moved:
            steps.append(
                SimStep(
                    len(steps),
                    f"Read '{ch}'",
                    f"No transition on '{ch}' from {fmt(active)}. Input rejected.",
                    (),
                    (),
                    pos,
                    ch,
                )
            )
            stuck = True
            active = frozenset()
            break
        closed = epsilon_closure(a, moved)
        eps_used = epsilon_edges(a, closed)
        detail = f"{fmt(active)} --{ch}--> {fmt(moved)}"
        if closed != moved:
            detail += f"; epsilon-closure = {fmt(closed)}"
        steps.append(
            SimStep(
                len(steps), f"Read '{ch}'", detail, ordered(closed), sym_edges + eps_used, pos, ch
            )
        )
        active = closed

    return Trace(bool(active & a.accepting), tuple(steps), stuck)
