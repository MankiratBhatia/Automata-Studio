import pytest

from automata_core.errors import RegexSyntaxError
from automata_core.regex.parser import (
    Concat,
    EmptySet,
    Epsilon,
    Optional,
    Plus,
    Star,
    Symbol,
    Union,
    alphabet_of,
    parse,
    show,
)

a, b, c = Symbol("a"), Symbol("b"), Symbol("c")


def test_single_symbol() -> None:
    assert parse("a") == a


def test_concatenation_is_n_ary() -> None:
    assert parse("abc") == Concat((a, b, c))


def test_union_is_n_ary() -> None:
    assert parse("a|b|c") == Union((a, b, c))


def test_star_binds_tighter_than_concatenation_which_binds_tighter_than_union() -> None:
    assert parse("ab|c*") == Union((Concat((a, b)), Star(c)))


def test_parentheses_override_precedence() -> None:
    assert parse("(ab)*") == Star(Concat((a, b)))
    assert parse("a(b|c)") == Concat((a, Union((b, c))))


def test_all_postfix_operators() -> None:
    assert parse("a*") == Star(a)
    assert parse("a+") == Plus(a)
    assert parse("a?") == Optional(a)


def test_postfix_operators_stack() -> None:
    assert parse("a*+") == Plus(Star(a))


def test_epsilon_and_empty_set() -> None:
    assert parse("ε") == Epsilon()
    assert parse("∅") == EmptySet()
    assert parse("aε") == Concat((a, Epsilon()))


def test_backslash_escapes_operators() -> None:
    assert parse(r"\*") == Symbol("*")
    assert parse(r"a\|b") == Concat((a, Symbol("|"), b))
    assert parse(r"\\") == Symbol("\\")


def test_whitespace_is_ignored() -> None:
    assert parse(" a  b ") == Concat((a, b))


def test_digits_and_other_characters_are_symbols() -> None:
    assert parse("01") == Concat((Symbol("0"), Symbol("1")))


def test_alphabet_is_sorted_and_unique() -> None:
    assert alphabet_of(parse("(b|a)*cab")) == ["a", "b", "c"]
    assert alphabet_of(parse("ε")) == []


@pytest.mark.parametrize(
    ("pattern", "position"),
    [
        ("", 0),
        ("   ", 0),
        ("|a", 0),  # nothing before the union
        ("a|", 2),  # nothing after the union
        ("a||b", 2),
        ("*a", 0),  # nothing to repeat
        ("a|*", 2),
        ("(a", 0),  # reported at the unclosed '('
        ("a)", 1),
        ("()", 1),
        ("a(b|)", 4),
        ("a\\", 1),  # dangling escape
    ],
)
def test_syntax_errors_report_the_position(pattern: str, position: int) -> None:
    with pytest.raises(RegexSyntaxError) as e:
        parse(pattern)
    assert e.value.position == position, e.value.message


def test_error_messages_name_the_problem() -> None:
    with pytest.raises(RegexSyntaxError, match="nothing to repeat"):
        parse("*a")
    with pytest.raises(RegexSyntaxError, match=r"Missing '\)'"):
        parse("(a")
    with pytest.raises(RegexSyntaxError, match=r"Unmatched '\)'"):
        parse("a)")


def test_deep_nesting_is_an_error_not_a_crash() -> None:
    with pytest.raises(RegexSyntaxError, match="too deeply"):
        parse("(" * 300 + "a" + ")" * 300)


@pytest.mark.parametrize(
    "pattern", ["a", "ab|c*", "(ab)*", "a(b|c)+", "(a|b)*abb", "a?b", "ε", "∅", "(a*)*"]
)
def test_show_round_trips_through_the_parser(pattern: str) -> None:
    assert parse(show(parse(pattern))) == parse(pattern)
