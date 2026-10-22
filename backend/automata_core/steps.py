from __future__ import annotations

from dataclasses import dataclass, field

from automata_core.model import Automaton


@dataclass(frozen=True)
class Step:
    """One human-readable step of an algorithm run, replayed by the UI's step player.

    `states` and `transitions` (indices into the automaton) say what to highlight.

    The keyword-only fields describe how the *result* grows, so a player can build it up
    step by step: `adds_states` are result state ids first created by this step and
    `adds_transitions` are indices into the result's transitions. `round` says which
    partition of `Conversion.rounds` this step shows (minimisation only).
    """

    index: int
    title: str
    detail: str
    states: tuple[str, ...] = ()
    transitions: tuple[int, ...] = ()
    adds_states: tuple[str, ...] = field(default=(), kw_only=True)
    adds_transitions: tuple[int, ...] = field(default=(), kw_only=True)
    round: int | None = field(default=None, kw_only=True)


@dataclass(frozen=True)
class Conversion:
    """Result of a construction: the new automaton plus a replayable explanation.

    Step highlights (`states`, `transitions`) refer to the automaton the algorithm *reads*
    (its input). Constructions with no input automaton (regex -> epsilon-NFA) highlight the
    result instead.
    """

    automaton: Automaton
    steps: tuple[Step, ...]
    # New state id -> the source states it stands for (subset construction, minimisation).
    state_map: dict[str, tuple[str, ...]] | None = None
    # Minimisation only: the partition into blocks after each round, starting with round 0.
    rounds: tuple[tuple[tuple[str, ...], ...], ...] | None = None
