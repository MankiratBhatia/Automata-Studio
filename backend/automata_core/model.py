from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from functools import cached_property
from typing import Any, Literal

Kind = Literal["DFA", "NFA", "ENFA"]


@dataclass(frozen=True)
class Transition:
    src: str
    dst: str
    symbol: str | None  # None is epsilon


@dataclass(frozen=True)
class Automaton:
    """Immutable automaton. Transition order is preserved: indices refer to `transitions`."""

    kind: Kind
    alphabet: tuple[str, ...]
    states: tuple[str, ...]
    start: str | None
    accepting: frozenset[str]
    transitions: tuple[Transition, ...]
    name: str = ""

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> Automaton:
        """Build from the canonical JSON shape (see docs/PLAN.md section 2)."""
        return cls(
            kind=data["kind"],
            alphabet=tuple(data["alphabet"]),
            states=tuple(s["id"] for s in data["states"]),
            start=data["start"],
            accepting=frozenset(data["accepting"]),
            transitions=tuple(
                Transition(t["from"], t["to"], t["symbol"]) for t in data["transitions"]
            ),
            name=data.get("name", ""),
        )

    @cached_property
    def _outgoing(self) -> dict[str, list[tuple[int, Transition]]]:
        out: dict[str, list[tuple[int, Transition]]] = {}
        for i, t in enumerate(self.transitions):
            out.setdefault(t.src, []).append((i, t))
        return out

    def outgoing(self, state: str) -> Sequence[tuple[int, Transition]]:
        """Transitions leaving `state` as (index, transition) pairs."""
        return self._outgoing.get(state, [])
