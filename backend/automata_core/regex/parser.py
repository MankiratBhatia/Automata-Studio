"""Recursive-descent parser for the regex syntax used by Automata Studio.

    union   := concat ('|' concat)*
    concat  := repeat repeat*
    repeat  := atom ('*' | '+' | '?')*
    atom    := SYMBOL | 'ε' | '∅' | '(' union ')'

`|` is union. A backslash makes the next character a literal symbol (`\\*`). Whitespace is
ignored. Anything else, digits and letters included, is a one-character symbol.
"""

from __future__ import annotations

from dataclasses import dataclass

from automata_core.errors import RegexSyntaxError

MAX_NESTING = 100
_META = set("|*+?()")
_POSTFIX = {"*", "+", "?"}


@dataclass(frozen=True)
class Symbol:
    char: str


@dataclass(frozen=True)
class Epsilon:
    pass


@dataclass(frozen=True)
class EmptySet:
    pass


@dataclass(frozen=True)
class Concat:
    parts: tuple[Node, ...]


@dataclass(frozen=True)
class Union:
    parts: tuple[Node, ...]


@dataclass(frozen=True)
class Star:
    inner: Node


@dataclass(frozen=True)
class Plus:
    inner: Node


@dataclass(frozen=True)
class Optional:
    inner: Node


Node = Symbol | Epsilon | EmptySet | Concat | Union | Star | Plus | Optional


@dataclass(frozen=True)
class _Token:
    kind: str  # 'sym', 'eps', 'empty', or the operator character itself
    text: str
    pos: int


def _tokenize(pattern: str) -> list[_Token]:
    tokens: list[_Token] = []
    i = 0
    while i < len(pattern):
        ch = pattern[i]
        if ch.isspace():
            pass
        elif ch == "\\":
            if i + 1 >= len(pattern):
                raise RegexSyntaxError(
                    "A backslash must be followed by the character it escapes.", i
                )
            tokens.append(_Token("sym", pattern[i + 1], i))
            i += 1
        elif ch in _META:
            tokens.append(_Token(ch, ch, i))
        elif ch == "ε":
            tokens.append(_Token("eps", ch, i))
        elif ch == "∅":
            tokens.append(_Token("empty", ch, i))
        else:
            tokens.append(_Token("sym", ch, i))
        i += 1
    return tokens


class _Parser:
    def __init__(self, tokens: list[_Token], end: int) -> None:
        self.tokens = tokens
        self.end = end  # position reported for "unexpected end of input"
        self.i = 0

    def peek(self) -> _Token | None:
        return self.tokens[self.i] if self.i < len(self.tokens) else None

    def union(self, depth: int) -> Node:
        parts = [self.concat(depth)]
        while (t := self.peek()) is not None and t.kind == "|":
            self.i += 1
            parts.append(self.concat(depth))
        return parts[0] if len(parts) == 1 else Union(tuple(parts))

    def concat(self, depth: int) -> Node:
        t = self.peek()
        if t is None:
            raise RegexSyntaxError("Expected an expression here, but the regex ended.", self.end)
        if t.kind in ("|", ")"):
            raise RegexSyntaxError(f"Expected an expression before '{t.text}'.", t.pos)
        parts = [self.repeat(depth)]
        while (t := self.peek()) is not None and t.kind not in ("|", ")"):
            parts.append(self.repeat(depth))
        return parts[0] if len(parts) == 1 else Concat(tuple(parts))

    def repeat(self, depth: int) -> Node:
        node = self.atom(depth)
        while (t := self.peek()) is not None and t.kind in _POSTFIX:
            self.i += 1
            node = Star(node) if t.kind == "*" else Plus(node) if t.kind == "+" else Optional(node)
        return node

    def atom(self, depth: int) -> Node:
        t = self.tokens[self.i]
        self.i += 1
        if t.kind == "sym":
            return Symbol(t.text)
        if t.kind == "eps":
            return Epsilon()
        if t.kind == "empty":
            return EmptySet()
        if t.kind == "(":
            if depth + 1 > MAX_NESTING:
                raise RegexSyntaxError(
                    f"Parentheses are nested too deeply (limit {MAX_NESTING}).", t.pos
                )
            inner = self.union(depth + 1)
            close = self.peek()
            if close is None or close.kind != ")":
                raise RegexSyntaxError("Missing ')' to close this '('.", t.pos)
            self.i += 1
            return inner
        # Only postfix operators can get here; '|' and ')' are caught by concat().
        raise RegexSyntaxError(f"'{t.text}' has nothing to repeat.", t.pos)


def parse(pattern: str) -> Node:
    tokens = _tokenize(pattern)
    if not tokens:
        raise RegexSyntaxError("The regex is empty.", 0)
    parser = _Parser(tokens, len(pattern))
    node = parser.union(0)
    leftover = parser.peek()
    if leftover is not None:  # only an unmatched ')' can remain
        raise RegexSyntaxError("Unmatched ')'.", leftover.pos)
    return node


def alphabet_of(node: Node) -> list[str]:
    """The sorted, de-duplicated symbols a regex uses."""
    found: set[str] = set()

    def walk(n: Node) -> None:
        if isinstance(n, Symbol):
            found.add(n.char)
        elif isinstance(n, Concat | Union):
            for p in n.parts:
                walk(p)
        elif isinstance(n, Star | Plus | Optional):
            walk(n.inner)

    walk(node)
    return sorted(found)


# --- printing ---------------------------------------------------------------------------

_ESCAPED = set("|*+?()\\ ") | {"ε", "∅"}


def _prec(n: Node) -> int:
    if isinstance(n, Union):
        return 0
    if isinstance(n, Concat):
        return 1
    if isinstance(n, Star | Plus | Optional):
        return 2
    return 3


def show(node: Node, min_prec: int = 0) -> str:
    """Render a node as regex text that parses back to the same tree."""
    text: str
    if isinstance(node, Symbol):
        text = ("\\" + node.char) if node.char in _ESCAPED else node.char
    elif isinstance(node, Epsilon):
        text = "ε"
    elif isinstance(node, EmptySet):
        text = "∅"
    elif isinstance(node, Union):
        text = "|".join(show(p, 1) for p in node.parts)
    elif isinstance(node, Concat):
        text = "".join(show(p, 2) for p in node.parts)
    else:
        op = {Star: "*", Plus: "+", Optional: "?"}[type(node)]
        text = show(node.inner, 3) + op
    return f"({text})" if _prec(node) < min_prec else text
