import re

import pytest

from automata_core.closure import epsilon_closure
from automata_core.errors import RegexSyntaxError
from automata_core.regex.thompson import regex_to_enfa
from automata_core.simulate import simulate, simulate_batch
from automata_core.validate import has_errors, validate
from tests.helpers import language


def accepts(a, word: str) -> bool:  # type: ignore[no-untyped-def]
    """Like simulate, but a symbol outside the alphabet just means "no match"."""
    return simulate_batch(a, [word])[0].accepted is True


def build(pattern: str):  # type: ignore[no-untyped-def]
    return regex_to_enfa(pattern)


@pytest.mark.parametrize(
    ("pattern", "states"),
    [("a", 2), ("ε", 2), ("∅", 2), ("ab", 4), ("a|b", 6), ("a*", 4), ("a+", 4), ("a?", 4)],
)
def test_classic_state_counts(pattern: str, states: int) -> None:
    assert len(build(pattern).automaton.states) == states


def test_result_is_a_valid_enfa_with_the_regex_alphabet() -> None:
    r = build("(a|b)*c")
    assert r.automaton.kind == "ENFA"
    assert r.automaton.alphabet == ("a", "b", "c")
    assert not has_errors(validate(r.automaton))


def test_start_state_is_q0_and_there_is_one_accepting_state_without_exits() -> None:
    a = build("(a|b)*abb").automaton
    assert a.start == "q0"
    (final,) = a.accepting
    assert a.outgoing(final) == []


def test_every_state_has_at_most_two_outgoing_transitions() -> None:
    a = build("(a|b)*a(a|b)?c+").automaton
    assert all(len(a.outgoing(s)) <= 2 for s in a.states)


def test_every_state_is_reachable_except_for_the_empty_set() -> None:
    a = build("(a|b)*abb").automaton
    assert not any(i.code == "UNREACHABLE" for i in validate(a))


def test_empty_set_regex_has_no_transitions_and_accepts_nothing() -> None:
    a = build("∅").automaton
    assert a.transitions == ()
    assert not simulate(a, "").accepted


@pytest.mark.parametrize(
    ("pattern", "yes", "no"),
    [
        ("a", ["a"], ["", "b", "aa"]),
        ("ε", [""], ["a"]),
        ("ab", ["ab"], ["a", "b", "ba", "abb"]),
        ("a|b", ["a", "b"], ["", "ab"]),
        ("a*", ["", "a", "aaa"], ["b", "ab"]),
        ("a+", ["a", "aaa"], ["", "b"]),
        ("a?", ["", "a"], ["aa"]),
        ("ab|c*", ["ab", "", "c", "ccc"], ["a", "abc", "cab"]),  # precedence
        ("a(b|c)", ["ab", "ac"], ["a", "abc", "bc"]),
        ("(ab)*", ["", "ab", "abab"], ["a", "aba", "ba"]),
        ("(a|b)*abb", ["abb", "aabb", "babb", "ababb"], ["", "ab", "abba", "bb"]),
        ("a∅", [], ["", "a"]),
        ("(a|∅)b", ["ab"], ["b", ""]),
        ("(a*)*", ["", "a", "aaa"], ["b"]),
        (r"\*+", ["*", "***"], ["", "a"]),
    ],
)
def test_language(pattern: str, yes: list[str], no: list[str]) -> None:
    a = build(pattern).automaton
    for w in yes:
        assert accepts(a, w), f"{pattern!r} should accept {w!r}"
    for w in no:
        assert not accepts(a, w), f"{pattern!r} should reject {w!r}"


@pytest.mark.parametrize(
    "pattern", ["(a|b)*abb", "a*b*", "(ab|a)(c|ε)", "((a|b)(a|b))*", "a?a?a?aaa"]
)
def test_agrees_with_python_re_on_every_short_word(pattern: str) -> None:
    py = pattern.replace("ε", "(?:)")
    a = build(pattern).automaton
    got = language(a, a.alphabet, 6)
    want = frozenset(w for w in _words(a.alphabet, 6) if re.fullmatch(py, w) is not None)
    assert got == want


def _words(alphabet: tuple[str, ...], n: int) -> list[str]:
    from tests.helpers import all_words

    return all_words(alphabet, n)


def test_epsilon_closure_of_the_start_covers_the_star_bypass() -> None:
    a = build("a*").automaton
    assert a.accepting <= epsilon_closure(a, {a.start})  # type: ignore[arg-type]


def test_bad_regex_raises_with_position() -> None:
    with pytest.raises(RegexSyntaxError) as e:
        build("(a|")
    assert e.value.position is not None


# --- steps --------------------------------------------------------------------------------


def test_steps_are_numbered_described_and_end_with_a_summary() -> None:
    r = build("(a|b)*abb")
    assert [s.index for s in r.steps] == list(range(len(r.steps)))
    assert all(s.title and s.detail for s in r.steps)
    assert r.steps[-1].title.startswith("Done")


def test_each_step_highlights_states_and_edges_of_the_final_automaton() -> None:
    r = build("ab|c")
    ids = set(r.automaton.states)
    for s in r.steps[:-1]:
        assert s.states and set(s.states) <= ids
        assert all(0 <= t < len(r.automaton.transitions) for t in s.transitions)


def test_steps_build_from_the_leaves_up() -> None:
    titles = [s.title for s in build("ab|c").steps]
    assert titles.index("Symbol 'a'") < titles.index("Concatenation: ab")
    assert titles.index("Concatenation: ab") < titles.index("Union: ab|c")


# --- what each step adds, so a player can grow the automaton -------------------------------


def test_steps_together_add_every_state_and_transition_exactly_once() -> None:
    r = build("(a|b)*abb")
    states = [x for s in r.steps for x in s.adds_states]
    edges = [x for s in r.steps for x in s.adds_transitions]
    assert sorted(states) == sorted(r.automaton.states)
    assert sorted(edges) == list(range(len(r.automaton.transitions)))


def test_a_step_adds_only_states_not_added_before() -> None:
    steps = build("ab|c").steps
    leaf_a = next(s for s in steps if s.title == "Symbol 'a'")
    concat = next(s for s in steps if s.title.startswith("Concatenation"))
    assert len(leaf_a.adds_states) == 2
    assert concat.adds_states == ()  # joins existing fragments with epsilon edges only
    assert len(concat.adds_transitions) == 1


def test_added_transitions_belong_to_the_fragment_being_highlighted() -> None:
    r = build("a*")
    star = next(s for s in r.steps if s.title.startswith("Star"))
    assert set(star.adds_transitions) <= set(range(len(r.automaton.transitions)))
    assert len(star.adds_transitions) == 4  # in, out, skip, repeat
