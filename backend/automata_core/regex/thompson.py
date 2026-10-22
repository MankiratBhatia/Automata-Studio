"""Thompson's construction: regex AST -> epsilon-NFA, with one step per fragment built."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from automata_core.model import Automaton, Transition
from automata_core.regex.parser import (
    Concat,
    EmptySet,
    Epsilon,
    Node,
    Optional,
    Plus,
    Star,
    Symbol,
    Union,
    alphabet_of,
    parse,
    show,
)
from automata_core.steps import Conversion, Step


@dataclass
class _Frag:
    title: str
    detail: str
    states: range  # temporary integer ids created while building this fragment
    edges: range  # indices of the transitions this node itself added


class _Builder:
    def __init__(self) -> None:
        self.n = 0
        self.edges: list[tuple[int, int, str | None]] = []
        self.frags: list[_Frag] = []

    def new(self) -> int:
        self.n += 1
        return self.n - 1

    def build(self, node: Node) -> tuple[int, int]:
        lo = self.n
        if isinstance(node, Symbol | Epsilon | EmptySet):
            s, e = self.new(), self.new()
            elo = len(self.edges)
            if isinstance(node, Symbol):
                self.edges.append((s, e, node.char))
                title, detail = f"Symbol '{node.char}'", f"One edge on '{node.char}'."
            elif isinstance(node, Epsilon):
                self.edges.append((s, e, None))
                title, detail = "Epsilon", "One ε-edge: matches the empty string."
            else:
                title, detail = "Empty set", "No edge: no string can get through."
            self._record(title, detail, lo, elo)
            return s, e

        if isinstance(node, Concat):
            kids = [self.build(p) for p in node.parts]
            elo = len(self.edges)
            for (_, e1), (s2, _) in zip(kids, kids[1:], strict=False):
                self.edges.append((e1, s2, None))
            self._record(
                f"Concatenation: {show(node)}",
                "An ε-edge joins the end of each part to the start of the next.",
                lo,
                elo,
            )
            return kids[0][0], kids[-1][1]

        if isinstance(node, Union):
            kids = [self.build(p) for p in node.parts]
            s, e = self.new(), self.new()
            elo = len(self.edges)
            for ks, ke in kids:
                self.edges.append((s, ks, None))
                self.edges.append((ke, e, None))
            self._record(
                f"Union: {show(node)}",
                "A new start state branches by ε into every alternative; each one leads by ε "
                "to a new accept state.",
                lo,
                elo,
            )
            return s, e

        assert isinstance(node, Star | Plus | Optional)
        cs, ce = self.build(node.inner)
        s, e = self.new(), self.new()
        elo = len(self.edges)
        self.edges.append((s, cs, None))
        self.edges.append((ce, e, None))
        if isinstance(node, Star):
            self.edges += [(s, e, None), (ce, cs, None)]
            title, detail = "Star", "ε-edges allow skipping the body or repeating it."
        elif isinstance(node, Plus):
            self.edges.append((ce, cs, None))
            title, detail = "Plus", "An ε-edge allows repeating the body; it cannot be skipped."
        else:
            self.edges.append((s, e, None))
            title, detail = "Optional", "An ε-edge allows skipping the body."
        self._record(f"{title}: {show(node)}", detail, lo, elo)
        return s, e

    def _record(self, title: str, detail: str, lo: int, elo: int) -> None:
        self.frags.append(_Frag(title, detail, range(lo, self.n), range(elo, len(self.edges))))


def regex_to_enfa(pattern: str) -> Conversion:
    """Parse `pattern` and build its epsilon-NFA. Raises RegexSyntaxError on bad input."""
    ast = parse(pattern)
    b = _Builder()
    start, end = b.build(ast)

    # Rename states in breadth-first order from the start so the diagram reads left to right
    # and the start state is q0. (Anything unreachable, like the end of ∅, goes last.)
    out: dict[int, list[int]] = {}
    for s, d, _ in b.edges:
        out.setdefault(s, []).append(d)
    order = [start]
    seen = {start}
    queue = deque([start])
    while queue:
        for d in out.get(queue.popleft(), []):
            if d not in seen:
                seen.add(d)
                order.append(d)
                queue.append(d)
    order += [i for i in range(b.n) if i not in seen]
    name = {old: f"q{new}" for new, old in enumerate(order)}

    automaton = Automaton(
        kind="ENFA",
        alphabet=tuple(alphabet_of(ast)),
        states=tuple(name[i] for i in sorted(range(b.n), key=order.index)),
        start=name[start],
        accepting=frozenset({name[end]}),
        transitions=tuple(Transition(name[s], name[d], c) for s, d, c in b.edges),
        name=f"Thompson: {pattern.strip()}",
    )

    steps: list[Step] = []
    added: set[str] = set()
    for i, f in enumerate(b.frags):
        fragment = sorted((name[x] for x in f.states), key=lambda s: int(s[1:]))
        fresh = tuple(s for s in fragment if s not in added)
        added.update(fresh)
        steps.append(
            Step(
                i,
                f.title,
                f.detail,
                tuple(fragment),
                tuple(f.edges),
                adds_states=fresh,
                adds_transitions=tuple(f.edges),
            )
        )
    steps.append(
        Step(
            len(steps),
            "Done",
            f"{len(automaton.states)} states, {len(automaton.transitions)} transitions. "
            f"Start {automaton.start}, accept {name[end]}.",
        )
    )
    return Conversion(automaton, tuple(steps))
