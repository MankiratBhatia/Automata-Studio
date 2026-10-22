from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from automata_core.validate import Issue


class AutomataError(Exception):
    """Base class for domain errors raised by the engine."""


class InvalidAutomatonError(AutomataError):
    """The automaton has validation errors, so an algorithm cannot run on it."""

    def __init__(self, issues: list[Issue]) -> None:
        self.issues = issues
        super().__init__("; ".join(i.message for i in issues))


class InputSymbolError(AutomataError):
    """An input string contains a symbol that is not in the alphabet."""

    def __init__(self, symbol: str, position: int) -> None:
        self.symbol = symbol
        self.position = position
        super().__init__(f"Input symbol {symbol!r} at position {position} is not in the alphabet.")


class RegexSyntaxError(AutomataError):
    """The regex is malformed. `position` is the 0-based character index of the problem."""

    def __init__(self, message: str, position: int) -> None:
        self.message = message
        self.position = position
        super().__init__(f"{message} (at position {position})")


class LimitExceededError(AutomataError):
    """A construction would create more states than the safety limit allows."""

    def __init__(self, limit: int) -> None:
        self.limit = limit
        super().__init__(
            f"The result would have more than {limit} states. "
            "Subset construction can grow exponentially; try a smaller automaton."
        )


class WrongKindError(AutomataError):
    """An operation needs a different kind of automaton than the one it was given."""

    def __init__(self, expected: str, actual: str) -> None:
        self.expected = expected
        self.actual = actual
        super().__init__(
            f"This operation needs a {expected} but the automaton is a {actual}. "
            f"Convert it to a {expected} first."
        )
